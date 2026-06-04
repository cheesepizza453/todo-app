import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { User } from "firebase/auth";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {HeartIcon} from "./assets/icon/HeartIcon.tsx";
import {PhotoIcon} from "./assets/icon/PhotoIcon.tsx";
import {PlusIcon} from "./assets/icon/PlusIcon.tsx";
import {BackIcon} from "./assets/icon/BackIcon.tsx";
import {PencilIcon} from "./assets/icon/PencilIcon.tsx";
import "./App.css";

const MAX_MEMBERS = 20;
const STORAGE_KEY = "study-room-code";
const PHOTO_SIZE_LIMIT = 620_000;
const STORY_VISIBLE_MS = 24 * 60 * 60 * 1000;
const MAIN_ROOM_CODE = "MAIN";
const MAIN_ROOM_NAME = "뭐해";

const getTimestamp = () => new Date().getTime();

type Member = {
  uid: string;
  name: string;
  photoURL: string;
  joinedAt: number;
  nameChangedAt?: number;
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
  completedAt?: number | null;
  likes?: Record<string, Like>;
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
  photoLikes?: Record<string, Like>;
  updatedAt: number;
};

type PhotoPost = {
  id: string;
  uid: string;
  userName: string;
  userPhotoURL: string;
  weekId: string;
  dayIndex: number;
  dataUrl: string;
  createdAt: number;
  updatedAt: number;
  source?: "entry" | "post";
  entryId?: string;
};

type Like = {
  uid: string;
  name: string;
  photoURL: string;
  createdAt: number;
};

type Day = {
  date: Date;
  title: string;
  key: string;
};

type ProfileTab = "todo" | "photo";

type FeedItem =
  | {
      type: "photo";
      key: string;
      member: Member;
      photo: PhotoPost;
      timestamp: number;
    }
  | {
      type: "todo";
      key: string;
      member: Member;
      entry: Entry;
      todo: Todo;
      timestamp: number;
    }
  | {
      type: "todoDone";
      key: string;
      member: Member;
      entry: Entry;
      todo: Todo;
      timestamp: number;
    };

type LikeNotification = {
  id: string;
  fromName: string;
  fromPhotoURL: string;
  createdAt: number;
  message: string;
};

type LikeDocument = {
  id: string;
  itemType: "photo" | "todo";
  entryId: string;
  todoId: string;
  ownerUid: string;
  fromUid: string;
  fromName: string;
  fromPhotoURL: string;
  weekId: string;
  dayIndex: number;
  itemText: string;
  createdAt: number;
};

type StoryGroup = {
  member: Member;
  items: StoryItem[];
};

type StoryItem =
  | {
      type: "photo";
      key: string;
      member: Member;
      photo: PhotoPost;
      timestamp: number;
    }
  | {
      type: "todoDone";
      key: string;
      member: Member;
      entry: Entry;
      todo: Todo;
      timestamp: number;
    };

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

const getTodayIndex = () => {
  const today = new Date().getDay();
  return today === 0 ? 6 : today - 1;
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
      title: `${formatDotDate(date.getTime())}${
        date.toDateString() === today.toDateString() ? " 오늘" : ""
      }`,
    };
  });
};

const getInviteCodeFromUrl = () =>
  new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ??
  "";

const formatHour = (timestamp?: number | null) => {
  if (!timestamp) return "";

  return `${new Date(timestamp).getHours()}시`;
};

const formatShortDate = (timestamp?: number | null) => {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  return `${String(date.getFullYear()).slice(2)}년 ${
    date.getMonth() + 1
  }월 ${date.getDate()}일`;
};

const formatTodoDate = (timestamp?: number | null) => {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  return `${String(date.getFullYear()).slice(2)}년 ${
    date.getMonth() + 1
  }월 ${date.getDate()}일`;
};

const formatTodoPeriod = (todo: Todo) =>
  `${formatTodoDate(todo.createdAt)} 시작${
    todo.completedAt ? ` | ${formatTodoDate(todo.completedAt)} 완료` : ""
  }`;

const formatDotDate = (timestamp?: number | null) => {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  return `${String(date.getFullYear()).slice(2)}.${String(
    date.getMonth() + 1
  ).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
};

const makeLike = (user: User, member?: Member | null): Like => ({
  uid: user.uid,
  name: member?.name ?? user.displayName ?? "이름 없는 친구",
  photoURL: member?.photoURL ?? user.photoURL ?? "",
  createdAt: getTimestamp(),
});

const getLikeId = (itemType: "photo" | "todo", entryId: string, itemId: string, uid: string) =>
  `${itemType}_${entryId}_${itemId}_${uid}`;

const makeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
};

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
      throw new Error("이 방은 이미 20명이 꽉 찼어요!");
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
      let maxSide = 640;
      let quality = 0.68;
      let bestDataUrl = "";

      for (let attempt = 0; attempt < 12; attempt += 1) {
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
        const webpDataUrl = canvas.toDataURL("image/webp", quality);
        const dataUrl = webpDataUrl.startsWith("data:image/webp")
          ? webpDataUrl
          : canvas.toDataURL("image/jpeg", quality);
        bestDataUrl = dataUrl;

        if (dataUrl.length < PHOTO_SIZE_LIMIT) {
          resolve(dataUrl);
          return;
        }

        maxSide = Math.round(maxSide * 0.78);
        quality = Math.max(0.34, quality - 0.06);
      }

      if (bestDataUrl.length < PHOTO_SIZE_LIMIT) {
        resolve(bestDataUrl);
        return;
      }

      reject(new Error("사진 용량을 충분히 줄이지 못했어요!"));
    };

    reader.readAsDataURL(file);
  });

const resizeProfileImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      image.src = String(reader.result);
    };

    reader.onerror = reject;
    image.onerror = reject;

    image.onload = () => {
      const maxSide = 180;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("프로필 사진을 줄일 수 없어요."));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const webpDataUrl = canvas.toDataURL("image/webp", 0.72);
      resolve(
        webpDataUrl.startsWith("data:image/webp")
          ? webpDataUrl
          : canvas.toDataURL("image/jpeg", 0.72)
      );
    };

    reader.readAsDataURL(file);
  });

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [photoPosts, setPhotoPosts] = useState<PhotoPost[]>([]);
  const [likes, setLikes] = useState<LikeDocument[]>([]);
  const [inviteCode] = useState(() => getInviteCodeFromUrl());
  const targetRoomCode = inviteCode || MAIN_ROOM_CODE;
  const [roomCode, setRoomCode] = useState(
    () => targetRoomCode || localStorage.getItem(STORAGE_KEY) || MAIN_ROOM_CODE
  );
  const [todoText, setTodoText] = useState("");
  const [nicknameText, setNicknameText] = useState("");
  const [activeDay, setActiveDay] = useState(() => getTodayIndex());
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileTab>("todo");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [editingTodoKey, setEditingTodoKey] = useState("");
  const [editingTodoText, setEditingTodoText] = useState("");
  const [openPhotoMenuId, setOpenPhotoMenuId] = useState("");
  const [activeStoryUid, setActiveStoryUid] = useState<string | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [isSavingProfilePhoto, setIsSavingProfilePhoto] = useState(false);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const [message, setMessage] = useState("");
  const [storyNow, setStoryNow] = useState(() => getTimestamp());
  const dayStripRef = useRef<HTMLDivElement | null>(null);
  const activeDayRef = useRef(activeDay);
  const isProgrammaticDayScrollRef = useRef(false);

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
        })
        .catch((error) => {
          setRoom(null);
          setMessage(
            error instanceof Error ? error.message : "방 입장에 실패했어요!"
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
          setMessage("방을 준비하는 중이에요!");
          return;
        }

        const data = snapshot.data() as Omit<Room, "id">;
        setRoom({ id: snapshot.id, ...data });
      },
      () => {
        setRoom(null);
        setMessage("방을 불러올 권한이 없어요. Firestore 규칙을 확인해주세요!");
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

  useEffect(() => {
    if (!room) {
      return;
    }

    const photosQuery = query(
      collection(db, "rooms", room.id, "photos"),
      where("weekId", "==", weekId)
    );

    const unsubscribe = onSnapshot(photosQuery, (snapshot) => {
      const nextPhotoPosts = snapshot.docs.map((photoDoc) => ({
        id: photoDoc.id,
        source: "post" as const,
        ...photoDoc.data(),
      })) as PhotoPost[];

      setPhotoPosts(nextPhotoPosts);
    });

    return () => unsubscribe();
  }, [room, weekId]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const likesQuery = query(
      collection(db, "rooms", room.id, "likes"),
      where("weekId", "==", weekId)
    );

    const unsubscribe = onSnapshot(likesQuery, (snapshot) => {
      const nextLikes = snapshot.docs.map((likeDoc) => ({
        id: likeDoc.id,
        ...likeDoc.data(),
      })) as LikeDocument[];

      setLikes(nextLikes);
    });

    return () => unsubscribe();
  }, [room, weekId]);

  useEffect(() => {
    activeDayRef.current = activeDay;
  }, [activeDay]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStoryNow(getTimestamp());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!room || isProfileOpen || isNotificationsOpen) return;

    const dayStrip = dayStripRef.current;
    if (!dayStrip) return;

    isProgrammaticDayScrollRef.current = true;
    dayStrip.scrollLeft = activeDayRef.current * dayStrip.clientWidth;
    window.setTimeout(() => {
      isProgrammaticDayScrollRef.current = false;
    }, 120);
  }, [isNotificationsOpen, isProfileOpen, room]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("unauthorized-domain")
          ? "Firebase Auth에서 현재 주소를 허용하지 않았어요. localhost로 접속하거나 Firebase Authorized domains에 127.0.0.1을 추가해주세요!"
          : "로그인에 실패했어요. 잠시 뒤 다시 시도해주세요!";

      setMessage(message);
    }
  };

  const updateNickname = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !room) return;

    const nextName = nicknameText.trim();
    if (!nextName) return;

    try {
      await runTransaction(db, async (transaction) => {
        const roomRef = doc(db, "rooms", room.id);
        const roomSnapshot = await transaction.get(roomRef);

        if (!roomSnapshot.exists()) {
          throw new Error("방을 찾을 수 없어요!");
        }

        const data = roomSnapshot.data() as Omit<Room, "id">;
        const currentMember = data.members?.[user.uid];

        if (!currentMember) {
          throw new Error("방 멤버 정보를 찾을 수 없어요!");
        }

        if (currentMember.nameChangedAt) {
          throw new Error("닉네임은 한 번만 바꿀 수 있어요!");
        }

        transaction.update(roomRef, {
          [`members.${user.uid}.name`]: nextName,
          [`members.${user.uid}.nameChangedAt`]: getTimestamp(),
        });
      });

      setNicknameText("");
      setMessage("닉네임을 바꿨어요!");
      setIsEditingNickname(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "닉네임 변경에 실패했어요!"
      );
    }
  };

  const updateProfilePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user || !room) return;

    setIsSavingProfilePhoto(true);

    try {
      const photoDataUrl = await resizeProfileImage(file);
      await runTransaction(db, async (transaction) => {
        const roomRef = doc(db, "rooms", room.id);
        const roomSnapshot = await transaction.get(roomRef);

        if (!roomSnapshot.exists()) {
          throw new Error("방을 찾을 수 없어요!");
        }

        transaction.update(roomRef, {
          [`members.${user.uid}.photoURL`]: photoDataUrl,
        });
      });

      setMessage("프로필 사진을 바꿨어요!");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "프로필 사진 변경에 실패했어요!"
      );
    } finally {
      setIsSavingProfilePhoto(false);
      event.target.value = "";
    }
  };

  const openStory = (uid: string) => {
    const firstStoryIndex = storyItems.findIndex(
      (storyItem) => storyItem.member.uid === uid
    );

    if (firstStoryIndex < 0) return;

    setActiveStoryUid(uid);
    setActiveStoryIndex(firstStoryIndex);
  };

  const closeStory = () => {
    setActiveStoryUid(null);
    setActiveStoryIndex(0);
  };

  const showPreviousStory = () => {
    setActiveStoryIndex((currentIndex) => Math.max(0, currentIndex - 1));
  };

  const showNextStory = () => {
    setActiveStoryIndex((currentIndex) => {
      if (currentIndex >= storyItems.length - 1) {
        return currentIndex;
      }

      return currentIndex + 1;
    });
  };

  const upsertMyEntry = async (
    nextEntry: Partial<Entry>,
    dayIndex = activeDay
  ) => {
    if (!user || !room) return;

    const entryId = `${user.uid}_${weekId}_${dayIndex}`;
    const currentEntry = entries.find(
      (entry) => entry.uid === user.uid && entry.dayIndex === dayIndex
    );

    await setDoc(
      doc(db, "rooms", room.id, "entries", entryId),
      {
        uid: user.uid,
        userName: room.members[user.uid]?.name ?? user.displayName ?? "이름 없는 친구",
        userPhotoURL: room.members[user.uid]?.photoURL ?? user.photoURL ?? "",
        weekId,
        dayIndex,
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
    if (!text) return false;
    const todayIndex = getTodayIndex();

    try {
      const currentEntry = entries.find(
        (entry) => entry.uid === user?.uid && entry.dayIndex === todayIndex
      );
      const nextTodos = [
        ...(currentEntry?.todos ?? []),
        {
          id: makeId(),
          text,
          isDone: false,
          createdAt: getTimestamp(),
          completedAt: null,
        },
      ];

      await upsertMyEntry({ todos: nextTodos }, todayIndex);
      setTodoText("");
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "할 일 추가에 실패했어요!"
      );
      return false;
    }
  };

  const addTodoFromProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const didAddTodo = await addTodo();

    if (didAddTodo) {
      setActiveProfileTab("todo");
    }
  };

  const updateTodo = async (
    todoId: string,
    nextIsDone: boolean,
    dayIndex = activeDay
  ) => {
    if (!room) return;

    const currentEntry = entries.find(
      (entry) => entry.uid === user?.uid && entry.dayIndex === dayIndex
    );
    if (!currentEntry) return;

    const completionTime = nextIsDone ? getTimestamp() : null;

    await setDoc(
      doc(db, "rooms", room.id, "entries", currentEntry.id),
      {
        todos: currentEntry.todos.map((todo) =>
          todo.id === todoId
            ? { ...todo, isDone: nextIsDone, completedAt: completionTime }
            : todo
        ),
        updatedAt: getTimestamp(),
      },
      { merge: true }
    );
  };

  const updateTodoText = async (todoId: string, dayIndex: number) => {
    const text = editingTodoText.trim();
    if (!room || !text) return;

    const currentEntry = entries.find(
      (entry) => entry.uid === user?.uid && entry.dayIndex === dayIndex
    );
    if (!currentEntry) return;

    const updatedAt = getTimestamp();

    await setDoc(
      doc(db, "rooms", room.id, "entries", currentEntry.id),
      {
        todos: currentEntry.todos.map((todo) =>
          todo.id === todoId ? { ...todo, text, createdAt: updatedAt } : todo
        ),
        updatedAt,
      },
      { merge: true }
    );

    setEditingTodoKey("");
    setEditingTodoText("");
  };

  const togglePhotoLike = async (photo: PhotoPost) => {
    if (!user || !room) return;

    const likeId = getLikeId("photo", photo.id, "photo", user.uid);
    const likeRef = doc(db, "rooms", room.id, "likes", likeId);
    const existingLike = likes.find((like) => like.id === likeId);

    if (existingLike) {
      await deleteDoc(likeRef);
      return;
    }

    const like = makeLike(user, myMember);
    await setDoc(likeRef, {
      itemType: "photo",
      entryId: photo.id,
      todoId: "",
      ownerUid: photo.uid,
      fromUid: like.uid,
      fromName: like.name,
      fromPhotoURL: like.photoURL,
      weekId: photo.weekId,
      dayIndex: photo.dayIndex,
      itemText: "사진",
      createdAt: like.createdAt,
    });
  };

  const toggleTodoLike = async (entry: Entry, todoId: string) => {
    if (!user || !room) return;

    const todo = entry.todos.find((candidate) => candidate.id === todoId);
    if (!todo) return;

    const likeId = getLikeId("todo", entry.id, todoId, user.uid);
    const likeRef = doc(db, "rooms", room.id, "likes", likeId);
    const existingLike = likes.find((like) => like.id === likeId);

    if (existingLike) {
      await deleteDoc(likeRef);
      return;
    }

    const like = makeLike(user, myMember);
    await setDoc(likeRef, {
      itemType: "todo",
      entryId: entry.id,
      todoId,
      ownerUid: entry.uid,
      fromUid: like.uid,
      fromName: like.name,
      fromPhotoURL: like.photoURL,
      weekId: entry.weekId,
      dayIndex: entry.dayIndex,
      itemText: todo.text,
      createdAt: like.createdAt,
    });
  };

  const deleteTodo = async (todoId: string, dayIndex = activeDay) => {
    const currentEntry = entries.find(
      (entry) => entry.uid === user?.uid && entry.dayIndex === dayIndex
    );
    if (!currentEntry) return;

    await upsertMyEntry({
      todos: currentEntry.todos.filter((todo) => todo.id !== todoId),
    }, dayIndex);
  };

  const savePhotoForDay = async (
    file: File,
    dayIndex: number
  ) => {
    if (!user || !room) return;

    setIsSavingPhoto(true);
    setMessage("사진을 작게 줄이는 중이에요!");

    try {
      const photoDataUrl = await resizeImage(file);
      const timestamp = getTimestamp();
      const photoId = makeId();

      await setDoc(doc(db, "rooms", room.id, "photos", photoId), {
        uid: user.uid,
        userName: room.members[user.uid]?.name ?? user.displayName ?? "이름 없는 친구",
        userPhotoURL: room.members[user.uid]?.photoURL ?? user.photoURL ?? "",
        weekId,
        dayIndex,
        dataUrl: photoDataUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      setMessage("사진이 압축되어 저장됐어요!");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "사진 저장에 실패했어요. 다른 이미지를 골라주세요!"
      );
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const uploadProfileComposerPhoto = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await savePhotoForDay(file, getTodayIndex());
      setActiveProfileTab("photo");
    } finally {
      event.target.value = "";
    }
  };

  const deletePhoto = async (photo: PhotoPost) => {
    if (!room) return;

    if (photo.source === "entry" && photo.entryId) {
      await setDoc(
        doc(db, "rooms", room.id, "entries", photo.entryId),
        {
          photoDataUrl: "",
          photoUpdatedAt: null,
          updatedAt: getTimestamp(),
        },
        { merge: true }
      );
    } else {
      await deleteDoc(doc(db, "rooms", room.id, "photos", photo.id));
    }


    setMessage("사진을 삭제했어요!");
  };

  const members = useMemo(() => {
    if (!room) return [];
    return Object.values(room.members ?? {}).sort((a, b) => a.joinedAt - b.joinedAt);
  }, [room]);
  const allPhotoPosts = useMemo<PhotoPost[]>(
    () => [
      ...entries
        .filter((entry) => entry.photoDataUrl)
        .map<PhotoPost>((entry) => ({
          id: `entry_${entry.id}`,
          uid: entry.uid,
          userName: entry.userName,
          userPhotoURL: entry.userPhotoURL,
          weekId: entry.weekId,
          dayIndex: entry.dayIndex,
          dataUrl: entry.photoDataUrl,
          createdAt: entry.photoUpdatedAt ?? entry.updatedAt,
          updatedAt: entry.photoUpdatedAt ?? entry.updatedAt,
          source: "entry",
          entryId: entry.id,
        })),
      ...photoPosts,
    ],
    [entries, photoPosts]
  );
  const visibleStoryPhotos = useMemo(
    () =>
      allPhotoPosts.filter(
        (photo) => storyNow - photo.createdAt < STORY_VISIBLE_MS
      ),
    [allPhotoPosts, storyNow]
  );
  const visibleStoryTodos = useMemo(
    () =>
      entries.flatMap((entry) => {
        const member = members.find((candidate) => candidate.uid === entry.uid);
        if (!member) return [];

        return entry.todos
          .filter(
            (todo) =>
              todo.isDone &&
              Boolean(todo.completedAt) &&
              storyNow - Number(todo.completedAt) < STORY_VISIBLE_MS
          )
          .map<StoryItem>((todo) => ({
            type: "todoDone",
            key: `${member.uid}_${entry.id}_${todo.id}_${todo.completedAt}`,
            member,
            entry,
            todo,
            timestamp: Number(todo.completedAt),
          }));
      }),
    [entries, members, storyNow]
  );
  const storyGroups = useMemo<StoryGroup[]>(
    () =>
      members
        .map((member) => ({
          member,
          items: [
            ...visibleStoryPhotos
              .filter((photo) => photo.uid === member.uid)
              .map<StoryItem>((photo) => ({
                type: "photo",
                key: `${member.uid}_${photo.id}`,
                member,
                photo,
                timestamp: photo.createdAt,
              })),
            ...visibleStoryTodos.filter(
              (storyItem) => storyItem.member.uid === member.uid
            ),
          ]
            .sort(
              (firstStoryItem, secondStoryItem) =>
                firstStoryItem.timestamp - secondStoryItem.timestamp
            ),
        }))
        .filter((group) => group.items.length),
    [members, visibleStoryPhotos, visibleStoryTodos]
  );
  const storyItems: StoryItem[] = storyGroups
    .flatMap((group) => group.items)
    .sort(
      (firstStoryItem, secondStoryItem) =>
        firstStoryItem.timestamp - secondStoryItem.timestamp
    );
  const activeStoryItem =
    activeStoryUid && activeStoryIndex < storyItems.length
      ? storyItems[activeStoryIndex]
      : null;
  const activeStoryCount = storyItems.length;
  const hasActiveStoryItem = Boolean(activeStoryItem);

  useEffect(() => {
    if (!activeStoryUid || !hasActiveStoryItem) return;

    const timer = window.setTimeout(() => {
      if (activeStoryIndex >= activeStoryCount - 1) {
        setActiveStoryUid(null);
        setActiveStoryIndex(0);
        return;
      }

      setActiveStoryIndex(activeStoryIndex + 1);
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [activeStoryCount, activeStoryIndex, activeStoryUid, hasActiveStoryItem]);

  const myMember = user && room ? room.members[user.uid] : null;
  const canChangeNickname = Boolean(myMember && !myMember.nameChangedAt);
  const myTodoGroups = Object.values(
    entries
      .filter((entry) => entry.uid === user?.uid && entry.todos.length)
      .flatMap((entry) =>
        entry.todos.map((todo) => ({
          dayIndex: entry.dayIndex,
          sortTime: todo.completedAt ?? todo.createdAt,
          todo,
        }))
      )
      .reduce<
        Record<
          string,
          {
            key: string;
            title: string;
            sortTime: number;
            todos: Array<{ dayIndex: number; todo: Todo }>;
          }
        >
      >((groups, item) => {
        const dateKey = toDateKey(new Date(item.sortTime));

        groups[dateKey] ??= {
          key: dateKey,
          title: formatShortDate(item.sortTime),
          sortTime: item.sortTime,
          todos: [],
        };

        groups[dateKey].sortTime = Math.max(groups[dateKey].sortTime, item.sortTime);
        groups[dateKey].todos.push({
          dayIndex: item.dayIndex,
          todo: item.todo,
        });

        return groups;
      }, {})
  )
    .map((group) => ({
      ...group,
      todos: group.todos.sort(
        (firstItem, secondItem) =>
          (secondItem.todo.completedAt ?? secondItem.todo.createdAt) -
          (firstItem.todo.completedAt ?? firstItem.todo.createdAt)
      ),
    }))
    .sort((firstGroup, secondGroup) => secondGroup.sortTime - firstGroup.sortTime);
  const myPhotoEntries = allPhotoPosts
    .filter((photo) => photo.uid === user?.uid)
    .sort(
      (firstPhoto, secondPhoto) =>
        secondPhoto.createdAt - firstPhoto.createdAt
    );
  const likeNotifications = useMemo<LikeNotification[]>(() => {
    if (!user) return [];

    return likes
      .filter((like) => like.ownerUid === user.uid)
      .map((like) => {
        const dayTitle = weekDays[like.dayIndex]?.title ?? "기록";
        const reactionText = like.itemType === "photo" ? "좋아해요." : "응원해요.";
        const targetText =
          like.itemType === "photo"
            ? `${dayTitle} 올린 사진을`
            : `"${like.itemText}" 할 일을`;

        return {
          id: like.id,
          fromName: like.fromName,
          fromPhotoURL: like.fromPhotoURL,
          createdAt: like.createdAt,
          message: `${like.fromName}님이 ${targetText} ${reactionText}`,
        };
      })
      .sort(
        (firstNotification, secondNotification) =>
          secondNotification.createdAt - firstNotification.createdAt
      );
  }, [likes, user, weekDays]);

  if (!user) {
    return (
      <main className="relative bg-[#fdfbf4] text-center w-[100vw] h-[80vh]  flex justify-center items-start pt-[90px] px-[30px]">
        <div className="flex flex-col justify-center items-center pb-[300px]">
          <p className={' text-[32px] text-center text-[#343333] font-bold leading-[1.4]'}>소소하게 갓생 응원하고<br/>뭐 먹었는지 공유해요</p>
          <section className="mt-[6px] w-full">
            <figure className={'mt-50px] max-w-[700px]'}>
              <img src={'/main-1.jpg'} alt={'오리'}/>
            </figure>
            <div className={'absolute bottom-[30px] left-0 w-full overflow-hidden'}>
            <button className="rounded-[6px] w-[calc(100%-60px)] max-w-[800px] py-[15px] bg-[#333333] text-white font-normal"
                    onClick={login}>
              구글로 시작해줘
            </button>
            </div>
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

  if (isProfileOpen) {
    return (
      <main className="profile-screen">
        <header className="profile-header">
          <button
            className=""
            onClick={() => setIsProfileOpen(false)}
            type="button"
          >
            <BackIcon size={40}/>
          </button>
          <h1>마이</h1>
        </header>

        <section className="profile-panel">
          <div className={'relative'}>
            <div className="profile-photo-preview">
              {myMember?.photoURL ? (
                <img src={myMember.photoURL} alt=""/>
              ) : (
                <span>{myMember?.name.slice(0, 1) ?? "나"}</span>
              )}
            </div>
            <label className="absolute bottom-0 right-0 profile-photo-button rounded-full p-0 w-[30px] h-[30px] min-h-[30px]">
              <input
                accept="image/*"
                disabled={isSavingProfilePhoto}
                onChange={updateProfilePhoto}
                type="file"
              />
              {isSavingProfilePhoto ? "저장 중" : <PencilIcon size={25}/>}
            </label>
          </div>


          {canChangeNickname && isEditingNickname ? (
            <form className="profile-nickname-form flex justify-center gap-1" onSubmit={updateNickname}>
              <label>
                <input
                  autoFocus
                  disabled={!canChangeNickname}
                  maxLength={12}
                  onChange={(event) => setNicknameText(event.target.value)}
                  placeholder={myMember?.name ?? "닉네임"}
                  value={nicknameText}
                />
              </label>
              <button
                className={'px-[15px] bg-transparent text-[#333333] text-[12px]'}
                disabled={!nicknameText.trim()}
                type="submit"
              >
                저장
              </button>
              <button
                className={'px-[15px] bg-transparent text-[#333333] text-[12px]'}
                onClick={() => {
                  setNicknameText("");
                  setIsEditingNickname(false);
                }}
                type="button"
              >
                취소
              </button>
            </form>
          ) : (
            <div className="profile-nickname-view flex items-center gap-[5px]">
              <strong>{myMember?.name}</strong>

              {canChangeNickname ? (
                <button
                  className={'min-h-0 text-[12px]'}
                  onClick={() => {
                    setNicknameText(myMember?.name ?? "");
                    setIsEditingNickname(true);
                  }}
                  type="button"
                >
                  수정
                </button>
              ) : (
               ''
              )}
            </div>
          )}

          <section className="profile-manage-panel">
            <div className="profile-tabs" aria-label="마이 보기 선택">
              <button
                className={activeProfileTab === "todo" ? "active" : ""}
                onClick={() => setActiveProfileTab("todo")}
                type="button"
              >
                내 할 일
              </button>
              <button
                className={activeProfileTab === "photo" ? "active" : ""}
                onClick={() => setActiveProfileTab("photo")}
                type="button"
              >
                내 밥
              </button>
            </div>

            {activeProfileTab === "todo" ? (
              myTodoGroups.length ? (
                <div className="profile-todo-groups">
                  {myTodoGroups.map((group) => (
                    <section className="profile-todo-group" key={group.key}>
                      <h2>{group.title}</h2>
                      <ul>
                        {group.todos.map(({ dayIndex, todo }) => {
                          const todoKey = `${dayIndex}_${todo.id}`;
                          const isEditingTodo = editingTodoKey === todoKey;

                          return (
                            <li
                              className={todo.isDone ? "done" : ""}
                              key={todo.id}
                            >
                              <div className="profile-todo-swipe">
                                {isEditingTodo ? (
                                  <div className="profile-edit-row">
                                    <input
                                      autoFocus
                                      maxLength={255}
                                      onChange={(event) =>
                                        setEditingTodoText(event.target.value)
                                      }
                                      value={editingTodoText}
                                    />
                                    <button
                                      disabled={!editingTodoText.trim()}
                                      onClick={() =>
                                        updateTodoText(todo.id, dayIndex)
                                      }
                                      type="button"
                                    >
                                      저장
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingTodoKey("");
                                        setEditingTodoText("");
                                      }}
                                      type="button"
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      className="profile-todo-block my-todo-block"
                                      onClick={() => {
                                        const nextIsDone = !todo.isDone;
                                        void updateTodo(
                                          todo.id,
                                          nextIsDone,
                                          dayIndex
                                        );

                                        if (nextIsDone) {
                                          setMessage(
                                            "멋져요! 할 일을 완료했어요!"
                                          );
                                        }
                                      }}
                                      type="button"
                                    >
                                      <span className={'text-[15px]'}>{todo.text}</span>
                                      <time className={'text-[10px]'}>
                                        {formatTodoPeriod(todo)}
                                      </time>
                                    </button>
                                    <div className="profile-item-actions">
                                      <button
                                        className={''}
                                        onClick={() => {
                                          setEditingTodoKey(todoKey);
                                          setEditingTodoText(todo.text);
                                        }}
                                        type="button"
                                      >
                                        수정
                                      </button>
                                      <button
                                        onClick={() =>
                                          deleteTodo(todo.id, dayIndex)
                                        }
                                        type="button"
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <div className={'my-[60px]'}>
                  <figure>
                    <img src={"/empty.png"}/>
                  </figure>
                <p className="empty-note">아직 등록한 할 일이 없어요.<br/>아래에서 작성해 보세요!</p>
                </div>
              )
            ) : myPhotoEntries.length ? (
              <div className="profile-photo-list">
                {myPhotoEntries.map((photo) => {
                  const photoLikes = likes.filter(
                    (like) =>
                      like.itemType === "photo" && like.entryId === photo.id
                  );
                  const isPhotoMenuOpen = openPhotoMenuId === photo.id;

                  return (
                    <section className="profile-photo-card" key={photo.id}>
                      <img src={photo.dataUrl} alt="내가 올린 사진" />
                      <button
                        className={`profile-photo-menu-button ${
                          isPhotoMenuOpen ? "active" : ""
                        }`}
                        onClick={() =>
                          setOpenPhotoMenuId(isPhotoMenuOpen ? "" : photo.id)
                        }
                        type="button"
                        title="사진 메뉴"
                      >
                        <PlusIcon/>
                      </button>

                      {isPhotoMenuOpen && (
                        <div className="profile-photo-menu">
                          <div className={'flex items-center gap-[2px] text-[14px] text-[#27934a]'}>
                            <HeartIcon filled={photoLikes.length > 0} color={'#27934a'}/>
                            <p className={' text-[#333333] font-normal '}>{photoLikes.length}</p>
                          </div>
                          <div>
                            <time
                              className={'text-[#333333] font-normal text-[12px]'}>{formatDotDate(photo.createdAt)}</time>
                            <button
                              className={'min-h-[20px] text-[#333333] font-normal text-[12px] text-right font-bold'}
                              onClick={() => deletePhoto(photo)}
                              type="button"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className={'my-[60px]'}>
                <figure>
                  <img src={"/empty.png"}/>
                </figure>
                <p className="empty-note">아직 등록한 밥짤이 없어요.<br/>아래 왼쪽 버튼을 눌러 올려보세요!</p>
              </div>
            )}
          </section>
        </section>

        <form className="profile-composer" onSubmit={addTodoFromProfile}>
          <label className="profile-composer-photo-button">
            <input
              accept="image/*"
              disabled={isSavingPhoto}
              onChange={uploadProfileComposerPhoto}
              type="file"
            />
            <PhotoIcon size={30}/>
          </label>
          <input
            maxLength={255}
            onChange={(event) => setTodoText(event.target.value)}
            placeholder="해야할 일을 입력해요"
            value={todoText}
          />
          <button
            disabled={!todoText.trim()}
            onClick={() => {
              void addTodo().then((didAddTodo) => {
                if (didAddTodo) {
                  setActiveProfileTab("todo");
                }
              });
            }}
            type="button"
          >
            작성
          </button>
        </form>

        {message && <p className="toast">{message}</p>}
      </main>
    );
  }

  if (isNotificationsOpen) {
    return (
      <main className="profile-screen">
        <header className="profile-header">
          <button
            className=""
            onClick={() => setIsNotificationsOpen(false)}
            type="button"
          >
            <BackIcon size={40}/>
          </button>
          <h1>알림</h1>
        </header>

        <section className="notification-list">
          {likeNotifications.length ? (
            likeNotifications.map((notification) => (
              <article className="notification-item" key={notification.id}>
                {notification.fromPhotoURL ? (
                  <img src={notification.fromPhotoURL} alt="" />
                ) : (
                  <span>{notification.fromName.slice(0, 1)}</span>
                )}
                <div>
                  <strong>{notification.message}</strong>
                  <time>{formatHour(notification.createdAt)}</time>
                </div>
              </article>
            ))
          ) : (
            <p className="empty-note">아직 받은 좋아요가 없어요.</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell py-[20px]">
      <header className="room-header pt-[4px] px-[18px] pb-[16px]">
        <div className="w-full flex items-center justify-between header-icon-actions">
          <button
            className="profile-icon-button"
            onClick={() => setIsProfileOpen(true)}
            type="button"
            title="프로필 수정"
          >
            {myMember?.photoURL ? (
              <img src={myMember.photoURL} alt=""/>
            ) : (
              <span>{myMember?.name.slice(0, 1) ?? "나"}</span>
            )}
          </button>
          <button
            className="relative text-[12px]"
            onClick={() => setIsNotificationsOpen(true)}
            type="button"
            title="좋아요 알림"
          >
            <HeartIcon size={30} color={'black'}/>
            {likeNotifications.length > 0 && (
              <span className={'flex justify-center items-center absolute bottom-[22px] right-[-4px] rounded-full w-[16px] h-[16px] text-white bg-blue'}>{likeNotifications.length}</span>
            )}
          </button>

        </div>
      </header>

      {storyGroups.length > 0 && (
        <section className="story-rail px-[18px] pb-[14px]" aria-label="스토리">
          {storyGroups.map((group) => (
            <button
              className="story-bubble"
              key={group.member.uid}
              onClick={() => openStory(group.member.uid)}
              type="button"
            >
              <span>
                {group.member.photoURL ? (
                  <img src={group.member.photoURL} alt="" />
                ) : (
                  group.member.name.slice(0, 1)
                )}
              </span>
              <strong>{group.member.name}</strong>
            </button>
          ))}
        </section>
      )}

      <section
        className="day-strip"
        ref={dayStripRef}
        onScroll={(event) => {
          if (isProgrammaticDayScrollRef.current) return;

          const width = event.currentTarget.clientWidth;
          const nextIndex = Math.round(event.currentTarget.scrollLeft / width);
          const clampedIndex = Math.min(6, Math.max(0, nextIndex));
          activeDayRef.current = clampedIndex;
          setActiveDay(clampedIndex);
        }}
      >
        {(() => {
          const photoFeedItems: FeedItem[] = allPhotoPosts.flatMap<FeedItem>(
            (photo) => {
              const member = members.find(
                (candidate) => candidate.uid === photo.uid
              );

              if (!member) return [];

              return [
                {
                  type: "photo",
                  key: `photo-${member.uid}-${photo.id}`,
                  member,
                  photo,
                  timestamp: photo.createdAt,
                },
              ];
            }
          );
          const todoFeedItems = entries
            .flatMap<FeedItem>((entry) => {
              const member = members.find((member) => member.uid === entry.uid);

              if (!member) return [];

              const items: FeedItem[] = [];

              entry.todos.forEach((todo) => {
                if (todo.isDone && todo.completedAt) {
                  items.push({
                    type: "todoDone",
                    key: `todo-done-${member.uid}-${todo.id}-${todo.completedAt}`,
                    member,
                    entry,
                    todo,
                    timestamp: todo.completedAt,
                  });
                }

                items.push({
                  type: "todo",
                  key: `todo-${member.uid}-${todo.id}`,
                  member,
                  entry,
                  todo,
                  timestamp: todo.createdAt,
                });
              });

              return items;
            });
          const feedItems = [...photoFeedItems, ...todoFeedItems]
            .sort(
              (firstItem, secondItem) => secondItem.timestamp - firstItem.timestamp
            );

          return (
            <article className="day-slide px-[15px]">
              <div className="friend-feed mt-[10px]">
                {feedItems.length ? (
                  feedItems.map((item) => {
                    if (item.type === "photo") {
                      const photoLikes = likes.filter(
                        (like) =>
                          like.itemType === "photo" &&
                          like.entryId === item.photo.id
                      );

                      const hasLikedPhoto = photoLikes.some(
                        (like) => like.fromUid === user.uid
                      );

                      return (
                        <section className="friend-card" key={item.key}>
                          <div className="friend-top">
                            {item.member.photoURL ? (
                              <figure className={'relative w-[42px] h-[42px] overflow-hidden'}>
                                <img className={'w-full h-full object-cover'} src={item.member.photoURL} alt="" />
                              </figure>
                            ) : (
                              <div className="avatar-fallback">
                                {item.member.name.slice(0, 1)}
                              </div>
                            )}

                            <div className={'gap-0'}>
                              <strong>{item.member.name}</strong>
                              <span className={'text-[10px]'}>
                                {formatShortDate(item.photo.createdAt)}
                              </span>
                            </div>
                          </div>

                          <div className="photo-frame">
                            <img
                              className="daily-photo"
                              src={item.photo.dataUrl}
                              alt={`${item.member.name}의 하루 사진`}
                            />
                          </div>

                          <button
                            className={`flex gap-[2px] ${
                              hasLikedPhoto ? "active text-blue" : ""
                            }`}
                            onClick={() => togglePhotoLike(item.photo)}
                            type="button"
                          >
                            <HeartIcon className={'mt-[1px]'} filled={photoLikes.length > 0}/> <span className={'text-[#333333]'}>{photoLikes.length}</span>
                          </button>
                        </section>
                      );
                    }

                    const todoLikes = likes.filter(
                      (like) =>
                        like.itemType === "todo" &&
                        like.entryId === item.entry.id &&
                        like.todoId === item.todo.id
                    );

                    const hasLikedTodo = todoLikes.some(
                      (like) => like.fromUid === user.uid
                    );

                    if (item.type === "todoDone") {
                      return (
                        <section
                          className="relative friend-card todo-complete-card overflow-hidden bg-[#fdfbf4]"
                          key={item.key}
                        >
                          <div className="friend-top">
                            {item.member.photoURL ? (
                              <figure className={'relative w-[42px] h-[42px] overflow-hidden'}>
                                <img className={'w-full h-full object-cover'} src={item.member.photoURL} alt="" />
                              </figure>
                            ) : (
                              <div className="avatar-fallback">
                                {item.member.name.slice(0, 1)}
                              </div>
                            )}

                            <div className={'gap-0'}>
                              <strong>{item.member.name}<p className={'inline ml-[2px] font-black text-green'}>님이 할 일을
                                해냈어요!</p></strong>
                              <span className={'text-[10px]'}>
                                {formatTodoPeriod(item.todo)}
                              </span>
                            </div>
                          </div>

                          <p className={'flex items-center'}>
                            <strong className={'underline single-todo-row'}>{item.todo.text}</strong>
                          </p>
                          <button
                            className={`flex gap-[2px] ${
                              hasLikedTodo ? "active text-blue" : ""
                            }`}
                            onClick={() => toggleTodoLike(item.entry, item.todo.id)}
                            type="button"
                          >
                            <HeartIcon className={'mt-[1px]'} filled={todoLikes.length > 0}/> <span className={'text-[#333333]'}>{todoLikes.length}</span>
                          </button>
                          <figure className={'absolute bottom-[-30px] right-[-20px] w-[170px] inline-block opacity-45'}>
                            <img className={'w-full'} src={'/stamp.png'} alt='스탬프'/>
                          </figure>
                        </section>
                      );
                    }

                    if (item.member.uid === user.uid) {
                      return (
                        <section
                          className={`todo-feed-card ${
                            item.todo.isDone ? "done" : ""
                          }`}
                          key={item.key}
                        >
                          <div className="feed-todo-swipe">
                            <article
                              className="friend-card feed-todo-card-body"
                              onClick={() => {
                                if (
                                  editingTodoKey ===
                                  `${item.entry.dayIndex}_${item.todo.id}`
                                ) {
                                  return;
                                }

                                const nextIsDone = !item.todo.isDone;
                                void updateTodo(
                                  item.todo.id,
                                  nextIsDone,
                                  item.entry.dayIndex
                                );

                                if (nextIsDone) {
                                  setMessage("멋져요! 할 일을 완료했어요!");
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") {
                                  return;
                                }

                                event.preventDefault();
                                event.currentTarget.click();
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="friend-top">
                                {item.member.photoURL ? (
                                  <figure className={'relative w-[42px] h-[42px] overflow-hidden'}>
                                    <img className={'w-full h-full object-cover'} src={item.member.photoURL} alt="" />
                                  </figure>
                                ) : (
                                  <div className="avatar-fallback">
                                    {item.member.name.slice(0, 1)}
                                  </div>
                                )}

                                <div className={'gap-0'}>
                                  <strong>{item.member.name}</strong>
                                  <span className={item.todo.isDone ?'text-[10px] text-white' : 'text-[10px] text-gray-500'}>{formatShortDate(item.todo.createdAt)}</span>
                                </div>
                              </div>

                              {editingTodoKey ===
                              `${item.entry.dayIndex}_${item.todo.id}` ? (
                                <div
                                  className="profile-edit-row"
                                  onClick={(event) => event.stopPropagation()}
                                  role="presentation"
                                >
                                  <input
                                    autoFocus
                                    maxLength={255}
                                    onChange={(event) =>
                                      setEditingTodoText(event.target.value)
                                    }
                                    value={editingTodoText}
                                  />
                                  <button
                                    disabled={!editingTodoText.trim()}
                                    onClick={() =>
                                      updateTodoText(
                                        item.todo.id,
                                        item.entry.dayIndex
                                      )
                                    }
                                    type="button"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingTodoKey("");
                                      setEditingTodoText("");
                                    }}
                                    type="button"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="profile-todo-block">
                                  <span className={'text-[15px]'}>{item.todo.text}</span>
                                </div>
                              )}
                              <button
                                className={`flex gap-[2px] ${
                                  hasLikedTodo ? "active text-blue" : ""
                                }`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleTodoLike(item.entry, item.todo.id)
                                }}
                                type="button"
                              >
                                <HeartIcon className={'mt-[1px]'}  filled={todoLikes.length > 0} /> <span className={item.todo.isDone ?'text-[#ffffff]':'text-[#333333]'}>{todoLikes.length}</span>
                              </button>
                            </article>
                            <div className="profile-item-actions">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditingTodoKey(
                                    `${item.entry.dayIndex}_${item.todo.id}`
                                  );
                                  setEditingTodoText(item.todo.text);
                                }}
                                type="button"
                              >
                                수정
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deleteTodo(
                                    item.todo.id,
                                    item.entry.dayIndex
                                  );
                                }}
                                type="button"
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        </section>
                      );
                    }

                    return (
                      <section
                        className={`friend-card todo-feed-card ${
                          item.todo.isDone ? "done" : ""
                        }`}
                        key={item.key}
                      >
                        <div className="friend-top">
                          {item.member.photoURL ? (
                            <figure className={'relative w-[42px] h-[42px] overflow-hidden'}>
                              <img className={'w-full h-full object-cover'} src={item.member.photoURL} alt="" />
                            </figure>
                          ) : (
                            <div className="avatar-fallback">
                              {item.member.name.slice(0, 1)}
                            </div>
                          )}

                          <div className={'gap-0'}>
                            <strong>{item.member.name}</strong>
                            <span className={'text-[10px]'}>{formatShortDate(item.todo.createdAt)}</span>
                          </div>
                        </div>

                        <div className="single-todo-row">
                          <span>{item.todo.text}</span>
                        </div>
                        <button
                          className={`flex gap-[2px] ${
                            hasLikedTodo ? "active text-blue" : ""
                          }`}
                          onClick={() => toggleTodoLike(item.entry, item.todo.id)}
                          type="button"
                        >
                          <HeartIcon className={'mt-[1px]'}  filled={todoLikes.length > 0} /> <span className={'text-[#333333]'}>{todoLikes.length}</span>
                        </button>


                      </section>
                    );
                  })
                ) : (
                  <p className="empty-note">아직 올라온 기록이 없어요.</p>
                )}
              </div>
            </article>
          );
        })()}
      </section>

      {activeStoryItem && (
        <div className="story-viewer" role="dialog" aria-label="스토리 보기">
          <div className="story-progress">
            {storyItems.map((storyItem, index) => (
              <span
                className={
                  index < activeStoryIndex
                    ? "active"
                    : index === activeStoryIndex
                      ? "current"
                      : ""
                }
                key={storyItem.key}
              />
            ))}
          </div>

          <header className="story-viewer-header">
            <div>
              {activeStoryItem.member.photoURL ? (
                <img src={activeStoryItem.member.photoURL} alt="" />
              ) : (
                <span>{activeStoryItem.member.name.slice(0, 1)}</span>
              )}
              <strong>{activeStoryItem.member.name}</strong>
              <time>{formatHour(activeStoryItem.timestamp)}</time>
            </div>
            <button className={'bg-transparent text-[12px]'} onClick={closeStory} type="button">
              닫기
            </button>
          </header>

          <div className="story-image-wrap">
            {activeStoryItem.type === "photo" ? (
              <img
                src={activeStoryItem.photo.dataUrl}
                alt={`${activeStoryItem.member.name}의 스토리`}
              />
            ) : (
              <article className="story-todo-card">
                <p>
                  <strong>{activeStoryItem.member.name}</strong>님이 할 일을
                  해냈어요!
                </p>
                <time>{formatTodoPeriod(activeStoryItem.todo)}</time>
                <span>{activeStoryItem.todo.text}</span>
              </article>
            )}
          </div>

          <div className="story-controls">
            <button
              className={'bg-transparent text-[14px]'}
              disabled={activeStoryIndex === 0}
              onClick={showPreviousStory}
              type="button"
            >
              이전
            </button>
            <button
              className={'bg-transparent text-[14px]'}
              disabled={activeStoryIndex >= storyItems.length - 1}
              onClick={showNextStory}
              type="button"
            >
              다음
            </button>
          </div>
        </div>
      )}

      <form className="profile-composer" onSubmit={addTodoFromProfile}>
        <label className="profile-composer-photo-button">
          <input
            accept="image/*"
            disabled={isSavingPhoto}
            onChange={uploadProfileComposerPhoto}
            type="file"
          />
          <PhotoIcon size={30}/>
        </label>
        <input
          maxLength={255}
          onChange={(event) => setTodoText(event.target.value)}
          placeholder="해야할 일을 입력해요"
          value={todoText}
        />
        <button
          disabled={!todoText.trim()}
          onClick={() => {
            void addTodo().then((didAddTodo) => {
              if (didAddTodo) {
                setActiveProfileTab("todo");
              }
            });
          }}
          type="button"
        >
          작성
        </button>
      </form>

      {message && <p className="toast">{message}</p>}
    </main>
  );
}

export default App;
