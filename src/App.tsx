import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { User } from "firebase/auth";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import "./App.css";
import { auth, db } from "./firebase";

const MAX_MEMBERS = 7;
const STORAGE_KEY = "study-room-code";
const PHOTO_SIZE_LIMIT = 680 * 1024;
const MAIN_ROOM_CODE = "MAIN";
const MAIN_ROOM_NAME = "뭐해";

const getTimestamp = () => new Date().getTime();

type Member = {
  uid: string;
  name: string;
  photoURL: string;
  joinedAt: number;
};

type Room = {
  id: string;
  name: string;
  ownerId: string;
  weekId: string;
  createdAt: number;
  members: Record<string, Member>;
};

type Todo = {
  id: string;
  text: string;
  isDone: boolean;
  createdAt: number;
};

type Entry = {
  id: string;
  uid: string;
  userName: string;
  userPhotoURL: string;
  weekId: string;
  dayIndex: number;
  todos: Todo[];
  photoDataUrl: string;
  photoUpdatedAt: number | null;
  updatedAt: number;
};

type Day = {
  date: Date;
  label: string;
  shortLabel: string;
  key: string;
  isToday: boolean;
};

type FeedView = "photo" | "todo";

const makeMember = (user: User): Member => ({
  uid: user.uid,
  name: user.displayName ?? "이름 없는 친구",
  photoURL: user.photoURL ?? "",
  joinedAt: getTimestamp(),
});

const getWeekStart = (date = new Date()) => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getWeekId = (date = new Date()) => {
  const weekStart = getWeekStart(date);
  return toDateKey(weekStart);
};

const getWeekDays = (): Day[] => {
  const today = new Date();
  const weekStart = getWeekStart(today);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);

    return {
      date,
      key: toDateKey(date),
      label: date.toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "long",
      }),
      shortLabel: date.toLocaleDateString("ko-KR", {
        weekday: "short",
        day: "numeric",
      }),
      isToday: date.toDateString() === today.toDateString(),
    };
  });
};

const getInviteCodeFromUrl = () =>
  new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ??
  "";

const enterOrCreateRoom = async (user: User, code: string, weekId: string) => {
  await runTransaction(db, async (transaction) => {
    const roomRef = doc(db, "rooms", code);
    const roomSnapshot = await transaction.get(roomRef);

    if (!roomSnapshot.exists()) {
      const member = makeMember(user);

      transaction.set(roomRef, {
        name: code === MAIN_ROOM_CODE ? MAIN_ROOM_NAME : "친구들의 일주일",
        ownerId: user.uid,
        weekId,
        createdAt: getTimestamp(),
        members: {
          [user.uid]: member,
        },
      });
      return;
    }

    const data = roomSnapshot.data() as Omit<Room, "id">;
    const members = data.members ?? {};
    const isAlreadyMember = Boolean(members[user.uid]);

    if (!isAlreadyMember && Object.keys(members).length >= MAX_MEMBERS) {
      throw new Error("이 방은 이미 8명이 꽉 찼어요.");
    }

    transaction.update(roomRef, {
      [`members.${user.uid}`]: isAlreadyMember
        ? members[user.uid]
        : makeMember(user),
      weekId,
    });
  });
};

const resizeImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      image.src = String(reader.result);
    };

    reader.onerror = reject;
    image.onerror = reject;

    image.onload = async () => {
      let maxSide = 720;
      let quality = 0.72;
      let bestDataUrl = "";

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("이미지를 압축할 수 없어요."));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/webp", quality);
        bestDataUrl = dataUrl;

        if (dataUrl.length * 0.75 < PHOTO_SIZE_LIMIT) {
          resolve(dataUrl);
          return;
        }

        maxSide = Math.round(maxSide * 0.82);
        quality = Math.max(0.44, quality - 0.07);
      }

      resolve(bestDataUrl);
    };

    reader.readAsDataURL(file);
  });

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [inviteCode] = useState(() => getInviteCodeFromUrl());
  const targetRoomCode = inviteCode || MAIN_ROOM_CODE;
  const [roomCode, setRoomCode] = useState(
    () => targetRoomCode || localStorage.getItem(STORAGE_KEY) || MAIN_ROOM_CODE
  );
  const [todoText, setTodoText] = useState("");
  const [activeDay, setActiveDay] = useState(() => {
    const today = new Date().getDay();
    return today === 0 ? 6 : today - 1;
  });
  const [activeFeedView, setActiveFeedView] = useState<FeedView>("photo");
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const [message, setMessage] = useState(() =>
    getInviteCodeFromUrl()
      ? "초대 링크의 방으로 들어가는 중이에요."
      : "메인 방으로 들어가는 중이에요."
  );
  const dayStripRef = useRef<HTMLDivElement | null>(null);

  const weekId = useMemo(() => getWeekId(), []);
  const weekDays = useMemo(() => getWeekDays(), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (!currentUser) return;

      void enterOrCreateRoom(currentUser, targetRoomCode, weekId)
        .then(() => {
          localStorage.setItem(STORAGE_KEY, targetRoomCode);
          setRoomCode(targetRoomCode);
          setMessage(
            inviteCode ? "초대 링크의 방에 들어왔어요." : "메인 방에 들어왔어요."
          );
        })
        .catch((error) => {
          setRoom(null);
          setMessage(
            error instanceof Error ? error.message : "방 입장에 실패했어요."
          );
        });
    });

    return () => unsubscribe();
  }, [inviteCode, targetRoomCode, weekId]);

  useEffect(() => {
    if (!user || !roomCode) {
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, "rooms", roomCode),
      (snapshot) => {
        if (!snapshot.exists()) {
          setRoom(null);
          setMessage("방을 준비하는 중이에요.");
          return;
        }

        const data = snapshot.data() as Omit<Room, "id">;
        setRoom({ id: snapshot.id, ...data });
      },
      () => {
        setRoom(null);
        setMessage("방을 불러올 권한이 없어요. Firestore 규칙을 확인해주세요.");
      }
    );

    return () => unsubscribe();
  }, [roomCode, user]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const entriesQuery = query(
      collection(db, "rooms", room.id, "entries"),
      where("weekId", "==", weekId)
    );

    const unsubscribe = onSnapshot(entriesQuery, (snapshot) => {
      const nextEntries = snapshot.docs.map((entryDoc) => ({
        id: entryDoc.id,
        ...entryDoc.data(),
      })) as Entry[];

      setEntries(nextEntries);
    });

    return () => unsubscribe();
  }, [room, weekId]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("unauthorized-domain")
          ? "Firebase Auth에서 현재 주소를 허용하지 않았어요. localhost로 접속하거나 Firebase Authorized domains에 127.0.0.1을 추가해주세요."
          : "로그인에 실패했어요. 잠시 뒤 다시 시도해주세요.";

      setMessage(message);
    }
  };

  const scrollToDay = (dayIndex: number) => {
    setActiveDay(dayIndex);
    const target = dayStripRef.current?.querySelector<HTMLElement>(
      `[data-day-index="${dayIndex}"]`
    );
    target?.scrollIntoView({ behavior: "smooth", inline: "start" });
  };

  const upsertMyEntry = async (nextEntry: Partial<Entry>) => {
    if (!user || !room) return;

    const entryId = `${user.uid}_${weekId}_${activeDay}`;
    const currentEntry = entries.find(
      (entry) => entry.uid === user.uid && entry.dayIndex === activeDay
    );

    await setDoc(
      doc(db, "rooms", room.id, "entries", entryId),
      {
        uid: user.uid,
        userName: user.displayName ?? "이름 없는 친구",
        userPhotoURL: user.photoURL ?? "",
        weekId,
        dayIndex: activeDay,
        todos: currentEntry?.todos ?? [],
        photoDataUrl: currentEntry?.photoDataUrl ?? "",
        photoUpdatedAt: currentEntry?.photoUpdatedAt ?? null,
        updatedAt: getTimestamp(),
        ...nextEntry,
      },
      { merge: true }
    );
  };

  const addTodo = async () => {
    const text = todoText.trim();
    if (!text) return;

    const currentEntry = entries.find(
      (entry) => entry.uid === user?.uid && entry.dayIndex === activeDay
    );
    const nextTodos = [
      ...(currentEntry?.todos ?? []),
      {
        id: crypto.randomUUID(),
        text,
        isDone: false,
        createdAt: getTimestamp(),
      },
    ];

    await upsertMyEntry({ todos: nextTodos });
    setTodoText("");
  };

  const updateTodo = async (todoId: string, nextIsDone: boolean) => {
    const currentEntry = entries.find(
      (entry) => entry.uid === user?.uid && entry.dayIndex === activeDay
    );
    if (!currentEntry) return;

    await upsertMyEntry({
      todos: currentEntry.todos.map((todo) =>
        todo.id === todoId ? { ...todo, isDone: nextIsDone } : todo
      ),
    });
  };

  const deleteTodo = async (todoId: string) => {
    const currentEntry = entries.find(
      (entry) => entry.uid === user?.uid && entry.dayIndex === activeDay
    );
    if (!currentEntry) return;

    await upsertMyEntry({
      todos: currentEntry.todos.filter((todo) => todo.id !== todoId),
    });
  };

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSavingPhoto(true);
    setMessage("사진을 작게 줄이는 중이에요.");

    try {
      const photoDataUrl = await resizeImage(file);
      await upsertMyEntry({
        photoDataUrl,
        photoUpdatedAt: getTimestamp(),
      });
      setMessage("사진이 압축되어 저장됐어요.");
    } catch {
      setMessage("사진 저장에 실패했어요. 다른 이미지를 골라주세요.");
    } finally {
      setIsSavingPhoto(false);
      event.target.value = "";
    }
  };

  const members = useMemo(() => {
    if (!room) return [];
    return Object.values(room.members ?? {}).sort((a, b) => a.joinedAt - b.joinedAt);
  }, [room]);

  const myActiveEntry = entries.find(
    (entry) => entry.uid === user?.uid && entry.dayIndex === activeDay
  );

  if (!user) {
    return (
      <main className="bg-[#f5f7f8] text-center w-[100vw] h-[100vh] flex justify-center items-center">
        <div className="flex flex-col justify-between items-center">
          <p className={'text-[45px] text-center text-black font-bold leading-[1.1]'}>일시니들<br/>생존신고방️</p>
          <section className="mt-[6px] w-full">
            <p className={' text-[12px]'}>
              일상자랑 갓생자랑 뭐먹었는지 자랑하는 그런 방
            </p>
            <button className="rounded-[14px] w-full mt-[30px] px-[25px] py-[15px] bg-[#3f79eb] text-white font-regural"
                    onClick={login}>
              구글로 시작해줘
            </button>
          </section>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="room-screen">
      <header className="top-bar">
          <div>
            <strong>{user.displayName}</strong>
            <span>
              {inviteCode
                ? `${inviteCode} 방에 들어가는 중이에요.`
                : "메인 방을 준비하고 있어요."}
            </span>
          </div>
        </header>

        <section className="setup-panel invite-only-panel">
          <h2>{inviteCode ? "방을 불러오는 중" : "메인 방으로 들어가는 중"}</h2>
          <p>
            {inviteCode
              ? "링크에 담긴 방 코드로 자동 입장하고 있어요."
              : "로그인한 친구들은 같은 방에서 이번 주 기록을 같이 봅니다."}
          </p>
        </section>

        {message && <p className="toast">{message}</p>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="room-header">
        <div>
          <h1>{room.name}</h1>
          <p>
            {members.length}/{MAX_MEMBERS}명 참여 중 · 매주 월요일 새 기록으로
            시작
          </p>
        </div>
      </header>

      <nav className="day-tabs" aria-label="요일 선택">
        {weekDays.map((day, index) => (
          <button
            className={index === activeDay ? "active" : ""}
            key={day.key}
            onClick={() => scrollToDay(index)}
            type="button"
          >
            {day.shortLabel}
          </button>
        ))}
      </nav>

      <section
        className="day-strip"
        ref={dayStripRef}
        onScroll={(event) => {
          const width = event.currentTarget.clientWidth;
          const nextIndex = Math.round(event.currentTarget.scrollLeft / width);
          setActiveDay(Math.min(6, Math.max(0, nextIndex)));
        }}
      >
        {weekDays.map((day, dayIndex) => {
          const dayEntries = members.map((member) => {
            const entry = entries.find(
              (candidate) =>
                candidate.uid === member.uid && candidate.dayIndex === dayIndex
            );
            return { member, entry };
          });

          return (
            <article
              className="day-slide"
              data-day-index={dayIndex}
              key={day.key}
            >
              <div className="day-title">
                <div>
                  <h2>{day.label}</h2>
                  {day.isToday && <span>오늘</span>}
                </div>
                <p>{dayEntries.filter(({ entry }) => entry).length}명 기록</p>
              </div>

              <section className="composer">
                <div>
                  <strong>내 기록</strong>
                  <span>할 일과 사진은 이 날짜에 저장됩니다.</span>
                </div>
                <div className="todo-input">
                  <input
                    value={dayIndex === activeDay ? todoText : ""}
                    onChange={(event) => setTodoText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addTodo();
                    }}
                    placeholder="오늘 할 일"
                    disabled={dayIndex !== activeDay}
                  />
                  <button
                    className="icon-button"
                    onClick={addTodo}
                    disabled={dayIndex !== activeDay}
                    type="button"
                    title="할 일 추가"
                  >
                    +
                  </button>
                </div>
                <label className="photo-button">
                  <input
                    accept="image/*"
                    disabled={dayIndex !== activeDay || isSavingPhoto}
                    onChange={uploadPhoto}
                    type="file"
                  />
                  {isSavingPhoto && dayIndex === activeDay ? "압축 중" : "사진 올리기"}
                </label>
              </section>

              <div className="friend-feed">
                {dayEntries.map(({ member, entry }) => {
                  const todos = entry?.todos ?? [];
                  const doneCount = todos.filter((todo) => todo.isDone).length;
                  const isMine = member.uid === user.uid;

                  return (
                    <section className="friend-card" key={member.uid}>
                      <div className="friend-top">
                        {member.photoURL ? (
                          <img src={member.photoURL} alt="" />
                        ) : (
                          <div className="avatar-fallback">
                            {member.name.slice(0, 1)}
                          </div>
                        )}
                        <div>
                          <strong>{member.name}</strong>
                          <span>
                            {todos.length
                              ? `${doneCount}/${todos.length} 완료`
                              : "아직 할 일이 없어요"}
                          </span>
                        </div>
                      </div>

                      {activeFeedView === "photo" &&
                        (entry?.photoDataUrl ? (
                          <img
                            className="daily-photo"
                            src={entry.photoDataUrl}
                            alt={`${member.name}의 하루 사진`}
                          />
                        ) : (
                          <div className="photo-placeholder">사진 대기 중</div>
                        ))}

                      {activeFeedView === "todo" &&
                        (todos.length ? (
                          <ul className="todo-list">
                            {todos.map((todo) => (
                              <li
                                className={todo.isDone ? "done" : ""}
                                key={todo.id}
                              >
                                {isMine && dayIndex === activeDay ? (
                                  <input
                                    checked={todo.isDone}
                                    onChange={(event) =>
                                      updateTodo(todo.id, event.target.checked)
                                    }
                                    type="checkbox"
                                  />
                                ) : (
                                  <span className="status-dot" />
                                )}
                                <span>{todo.text}</span>
                                {isMine && dayIndex === activeDay && (
                                  <button
                                    onClick={() => deleteTodo(todo.id)}
                                    title="삭제"
                                    type="button"
                                  >
                                    ×
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="empty-note">아직 할 일이 없어요.</p>
                        ))}

                      {!todos.length && !entry?.photoDataUrl && activeFeedView === "photo" && (
                        <p className="empty-note">오늘은 조용한 날이에요.</p>
                      )}
                    </section>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>

      <div className="slide-indicators" aria-label="피드 보기 선택">
        <button
          className={activeFeedView === "photo" ? "active" : ""}
          onClick={() => setActiveFeedView("photo")}
          type="button"
        >
          사진
        </button>
        <button
          className={activeFeedView === "todo" ? "active" : ""}
          onClick={() => setActiveFeedView("todo")}
          type="button"
        >
          투두
        </button>
      </div>

      {message && <p className="toast">{message}</p>}
      {myActiveEntry?.photoDataUrl && (
        <p className="storage-note">
          사진은 업로드 시 WebP로 축소되어 이번 주 기록에만 저장됩니다.
        </p>
      )}
    </main>
  );
}

export default App;
