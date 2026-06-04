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
import { AuthScreen, RoomLoadingScreen } from "./components/AppComponents";
import { HomePage } from "./pages/HomePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProfilePage } from "./pages/ProfilePage";

const MAX_MEMBERS = 20;
const STORAGE_KEY = "study-room-code";
const DISMISSED_NOTIFICATIONS_KEY = "dismissed-like-notifications";
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

type CommentDocument = {
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
  text: string;
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

const sanitizeRoomCode = (code: string) =>
  code.trim().replaceAll("/", "-").slice(0, 60).toUpperCase();

const getHashRoomCodeFromUrl = () => {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return "";

  try {
    return sanitizeRoomCode(decodeURIComponent(hash));
  } catch {
    return sanitizeRoomCode(hash);
  }
};

const getInviteCodeFromUrl = () =>
  sanitizeRoomCode(
    new URLSearchParams(window.location.search).get("room") ?? ""
  ) || getHashRoomCodeFromUrl();

const getIsDemoModeFromUrl = () =>
  new URLSearchParams(window.location.search).get("demo") === "1";

const formatHour = (timestamp?: number | null) => {
  if (!timestamp) return "";

  return `${new Date(timestamp).getHours()}시`;
};

const formatDateTime = (timestamp?: number | null) => {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  return `${String(date.getFullYear()).slice(2)}년 ${
    date.getMonth() + 1
  }월 ${date.getDate()}일 ${date.getHours()}시 ${date.getMinutes()}분`;
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

const createDemoUser = () =>
  ({
    uid: "demo-you",
    displayName: "나",
    photoURL: "",
  }) as User;

const createDemoData = (weekId: string, roomCode = "DEMO") => {
  const now = getTimestamp();
  const todayIndex = getTodayIndex();
  const dayBefore = Math.max(0, todayIndex - 1);
  const twoDaysBefore = Math.max(0, todayIndex - 2);

  const members: Record<string, Member> = {
    "demo-you": {
      uid: "demo-you",
      name: "나",
      photoURL: "",
      joinedAt: now - 40_000,
    },
    "demo-min": {
      uid: "demo-min",
      name: "민지",
      photoURL: "",
      joinedAt: now - 30_000,
    },
    "demo-jun": {
      uid: "demo-jun",
      name: "준호",
      photoURL: "",
      joinedAt: now - 20_000,
    },
    "demo-sol": {
      uid: "demo-sol",
      name: "솔",
      photoURL: "",
      joinedAt: now - 10_000,
    },
  };

  const room: Room = {
    id: roomCode,
    name: `${MAIN_ROOM_NAME} 데모`,
    ownerId: "demo-you",
    weekId,
    createdAt: now - 120_000,
    members,
  };

  const entries: Entry[] = [
    {
      id: `demo-you_${weekId}_${todayIndex}`,
      uid: "demo-you",
      userName: "나",
      userPhotoURL: "",
      weekId,
      dayIndex: todayIndex,
      todos: [
        {
          id: "demo-todo-1",
          text: "아침 산책 20분 하기",
          isDone: false,
          createdAt: now - 82_000_000,
          completedAt: null,
        },
        {
          id: "demo-todo-2",
          text: "영어 단어 30개 외우기",
          isDone: true,
          createdAt: now - 78_000_000,
          completedAt: now - 2_700_000,
        },
      ],
      photoDataUrl: "",
      photoUpdatedAt: null,
      updatedAt: now - 2_700_000,
    },
    {
      id: `demo-min_${weekId}_${todayIndex}`,
      uid: "demo-min",
      userName: "민지",
      userPhotoURL: "",
      weekId,
      dayIndex: todayIndex,
      todos: [
        {
          id: "demo-todo-3",
          text: "도서관에서 과제 마무리",
          isDone: false,
          createdAt: now - 5_200_000,
          completedAt: null,
        },
      ],
      photoDataUrl: "",
      photoUpdatedAt: null,
      updatedAt: now - 5_200_000,
    },
    {
      id: `demo-jun_${weekId}_${dayBefore}`,
      uid: "demo-jun",
      userName: "준호",
      userPhotoURL: "",
      weekId,
      dayIndex: dayBefore,
      todos: [
        {
          id: "demo-todo-4",
          text: "헬스장 다녀오기",
          isDone: true,
          createdAt: now - 95_000_000,
          completedAt: now - 3_800_000,
        },
      ],
      photoDataUrl: "",
      photoUpdatedAt: null,
      updatedAt: now - 3_800_000,
    },
    {
      id: `demo-sol_${weekId}_${twoDaysBefore}`,
      uid: "demo-sol",
      userName: "솔",
      userPhotoURL: "",
      weekId,
      dayIndex: twoDaysBefore,
      todos: [
        {
          id: "demo-todo-5",
          text: "밀린 방 정리하기",
          isDone: false,
          createdAt: now - 172_000_000,
          completedAt: null,
        },
      ],
      photoDataUrl: "",
      photoUpdatedAt: null,
      updatedAt: now - 172_000_000,
    },
  ];

  const photoPosts: PhotoPost[] = [
    {
      id: "demo-photo-1",
      uid: "demo-min",
      userName: "민지",
      userPhotoURL: "",
      weekId,
      dayIndex: todayIndex,
      dataUrl: "/main-1.jpg",
      createdAt: now - 1_800_000,
      updatedAt: now - 1_800_000,
      source: "post",
    },
    {
      id: "demo-photo-2",
      uid: "demo-you",
      userName: "나",
      userPhotoURL: "",
      weekId,
      dayIndex: todayIndex,
      dataUrl: "/main-1.jpg",
      createdAt: now - 6_800_000,
      updatedAt: now - 6_800_000,
      source: "post",
    },
    {
      id: "demo-photo-3",
      uid: "demo-jun",
      userName: "준호",
      userPhotoURL: "",
      weekId,
      dayIndex: dayBefore,
      dataUrl: "/main-1.jpg",
      createdAt: now - 25_000_000,
      updatedAt: now - 25_000_000,
      source: "post",
    },
  ];

  const likes: LikeDocument[] = [
    {
      id: "demo-like-1",
      itemType: "photo",
      entryId: "demo-photo-2",
      todoId: "",
      ownerUid: "demo-you",
      fromUid: "demo-min",
      fromName: "민지",
      fromPhotoURL: "",
      weekId,
      dayIndex: todayIndex,
      itemText: "사진",
      createdAt: now - 1_200_000,
    },
    {
      id: "demo-like-2",
      itemType: "todo",
      entryId: `demo-you_${weekId}_${todayIndex}`,
      todoId: "demo-todo-2",
      ownerUid: "demo-you",
      fromUid: "demo-jun",
      fromName: "준호",
      fromPhotoURL: "",
      weekId,
      dayIndex: todayIndex,
      itemText: "영어 단어 30개 외우기",
      createdAt: now - 800_000,
    },
  ];

  const comments: CommentDocument[] = [
    {
      id: "demo-comment-1",
      itemType: "photo",
      entryId: "demo-photo-1",
      todoId: "",
      ownerUid: "demo-min",
      fromUid: "demo-you",
      fromName: "나",
      fromPhotoURL: "",
      weekId,
      dayIndex: todayIndex,
      text: "맛있어 보여!",
      createdAt: now - 700_000,
    },
    {
      id: "demo-comment-2",
      itemType: "todo",
      entryId: `demo-you_${weekId}_${todayIndex}`,
      todoId: "demo-todo-2",
      ownerUid: "demo-you",
      fromUid: "demo-min",
      fromName: "민지",
      fromPhotoURL: "",
      weekId,
      dayIndex: todayIndex,
      text: "오늘도 해냈네 멋져",
      createdAt: now - 500_000,
    },
  ];

  return { comments, entries, likes, photoPosts, room };
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
  const isDemoMode = useMemo(() => getIsDemoModeFromUrl(), []);
  const weekId = useMemo(() => getWeekId(), []);
  const [inviteCode] = useState(() => getInviteCodeFromUrl());
  const targetRoomCode = inviteCode || MAIN_ROOM_CODE;
  const demoData = useMemo(
    () => (isDemoMode ? createDemoData(weekId, targetRoomCode) : null),
    [isDemoMode, targetRoomCode, weekId]
  );
  const [user, setUser] = useState<User | null>(() =>
    isDemoMode ? createDemoUser() : null
  );
  const [room, setRoom] = useState<Room | null>(() => demoData?.room ?? null);
  const [entries, setEntries] = useState<Entry[]>(() => demoData?.entries ?? []);
  const [photoPosts, setPhotoPosts] = useState<PhotoPost[]>(
    () => demoData?.photoPosts ?? []
  );
  const [likes, setLikes] = useState<LikeDocument[]>(() => demoData?.likes ?? []);
  const [comments, setComments] = useState<CommentDocument[]>(
    () => demoData?.comments ?? []
  );
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
  const [dismissedNotificationIdsByKey, setDismissedNotificationIdsByKey] =
    useState<Record<string, string[]>>({});
  const [storyNow, setStoryNow] = useState(() => getTimestamp());
  const dayStripRef = useRef<HTMLDivElement | null>(null);
  const activeDayRef = useRef(activeDay);
  const isProgrammaticDayScrollRef = useRef(false);

  const weekDays = useMemo(() => getWeekDays(), []);

  const notificationStorageKey =
    user && room
      ? `${DISMISSED_NOTIFICATIONS_KEY}:${room.id}:${user.uid}`
      : "";
  const dismissedNotificationIds = useMemo(() => {
    if (!notificationStorageKey) return [];

    if (dismissedNotificationIdsByKey[notificationStorageKey]) {
      return dismissedNotificationIdsByKey[notificationStorageKey];
    }

    try {
      const savedIds = JSON.parse(
        localStorage.getItem(notificationStorageKey) ?? "[]"
      );
      return Array.isArray(savedIds) ? savedIds : [];
    } catch {
      return [];
    }
  }, [dismissedNotificationIdsByKey, notificationStorageKey]);

  useEffect(() => {
    if (isDemoMode) {
      return;
    }

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
  }, [inviteCode, isDemoMode, targetRoomCode, weekId]);

  useEffect(() => {
    if (isDemoMode) {
      return;
    }

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
  }, [isDemoMode, roomCode, user]);

  useEffect(() => {
    if (isDemoMode) {
      return;
    }

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
  }, [isDemoMode, room, weekId]);

  useEffect(() => {
    if (isDemoMode) {
      return;
    }

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
  }, [isDemoMode, room, weekId]);

  useEffect(() => {
    if (isDemoMode) {
      return;
    }

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
  }, [isDemoMode, room, weekId]);

  useEffect(() => {
    if (isDemoMode) {
      return;
    }

    if (!room) {
      return;
    }

    const commentsQuery = query(
      collection(db, "rooms", room.id, "comments"),
      where("weekId", "==", weekId)
    );

    const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
      const nextComments = snapshot.docs.map((commentDoc) => ({
        id: commentDoc.id,
        ...commentDoc.data(),
      })) as CommentDocument[];

      setComments(nextComments);
    });

    return () => unsubscribe();
  }, [isDemoMode, room, weekId]);

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

    if (isDemoMode) {
      setRoom({
        ...room,
        members: {
          ...room.members,
          [user.uid]: {
            ...room.members[user.uid],
            name: nextName,
            nameChangedAt: getTimestamp(),
          },
        },
      });
      setNicknameText("");
      setMessage("데모에서 닉네임을 바꿨어요!");
      setIsEditingNickname(false);
      return;
    }

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

      if (isDemoMode) {
        setRoom({
          ...room,
          members: {
            ...room.members,
            [user.uid]: {
              ...room.members[user.uid],
              photoURL: photoDataUrl,
            },
          },
        });
        setMessage("데모에서 프로필 사진을 바꿨어요!");
        return;
      }

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

      if (isDemoMode && user && room) {
        const timestamp = getTimestamp();
        const nextTodo: Todo = {
          id: makeId(),
          text,
          isDone: false,
          createdAt: timestamp,
          completedAt: null,
        };

        if (currentEntry) {
          setEntries((currentEntries) =>
            currentEntries.map((entry) =>
              entry.id === currentEntry.id
                ? {
                    ...entry,
                    todos: [...entry.todos, nextTodo],
                    updatedAt: timestamp,
                  }
                : entry
            )
          );
        } else {
          setEntries((currentEntries) => [
            ...currentEntries,
            {
              id: `${user.uid}_${weekId}_${todayIndex}`,
              uid: user.uid,
              userName: room.members[user.uid]?.name ?? "나",
              userPhotoURL: room.members[user.uid]?.photoURL ?? "",
              weekId,
              dayIndex: todayIndex,
              todos: [nextTodo],
              photoDataUrl: "",
              photoUpdatedAt: null,
              updatedAt: timestamp,
            },
          ]);
        }

        setTodoText("");
        setMessage("데모에 할 일을 추가했어요!");
        return true;
      }

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

    if (isDemoMode) {
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          entry.id === currentEntry.id
            ? {
                ...entry,
                todos: entry.todos.map((todo) =>
                  todo.id === todoId
                    ? {
                        ...todo,
                        isDone: nextIsDone,
                        completedAt: completionTime,
                      }
                    : todo
                ),
                updatedAt: getTimestamp(),
              }
            : entry
        )
      );
      return;
    }

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

    if (isDemoMode) {
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          entry.id === currentEntry.id
            ? {
                ...entry,
                todos: entry.todos.map((todo) =>
                  todo.id === todoId
                    ? { ...todo, text, createdAt: updatedAt }
                    : todo
                ),
                updatedAt,
              }
            : entry
        )
      );
      setEditingTodoKey("");
      setEditingTodoText("");
      return;
    }

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
      if (isDemoMode) {
        setLikes((currentLikes) =>
          currentLikes.filter((like) => like.id !== likeId)
        );
        return;
      }

      await deleteDoc(likeRef);
      return;
    }

    const like = makeLike(user, myMember);

    if (isDemoMode) {
      setLikes((currentLikes) => [
        ...currentLikes,
        {
          id: likeId,
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
        },
      ]);
      return;
    }

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
      if (isDemoMode) {
        setLikes((currentLikes) =>
          currentLikes.filter((like) => like.id !== likeId)
        );
        return;
      }

      await deleteDoc(likeRef);
      return;
    }

    const like = makeLike(user, myMember);

    if (isDemoMode) {
      setLikes((currentLikes) => [
        ...currentLikes,
        {
          id: likeId,
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
        },
      ]);
      return;
    }

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

  const addComment = async (
    itemType: "photo" | "todo",
    entryId: string,
    todoId: string,
    ownerUid: string,
    dayIndex: number,
    text: string
  ) => {
    if (!user || !room) return false;

    const trimmedText = text.trim();
    if (!trimmedText) return false;

    const commentId = makeId();
    const timestamp = getTimestamp();
    const commenter = makeLike(user, myMember);
    const nextComment: CommentDocument = {
      id: commentId,
      itemType,
      entryId,
      todoId,
      ownerUid,
      fromUid: commenter.uid,
      fromName: commenter.name,
      fromPhotoURL: commenter.photoURL,
      weekId,
      dayIndex,
      text: trimmedText,
      createdAt: timestamp,
    };

    if (isDemoMode) {
      setComments((currentComments) => [...currentComments, nextComment]);
      return true;
    }

    await setDoc(doc(db, "rooms", room.id, "comments", commentId), {
      itemType,
      entryId,
      todoId,
      ownerUid,
      fromUid: commenter.uid,
      fromName: commenter.name,
      fromPhotoURL: commenter.photoURL,
      weekId,
      dayIndex,
      text: trimmedText,
      createdAt: timestamp,
    });

    return true;
  };

  const updateComment = async (commentId: string, text: string) => {
    if (!room) return false;

    const trimmedText = text.trim();
    if (!trimmedText) return false;

    const currentComment = comments.find((comment) => comment.id === commentId);
    if (!currentComment || currentComment.fromUid !== user?.uid) return false;

    if (isDemoMode) {
      setComments((currentComments) =>
        currentComments.map((comment) =>
          comment.id === commentId
            ? { ...comment, text: trimmedText }
            : comment
        )
      );
      return true;
    }

    await setDoc(
      doc(db, "rooms", room.id, "comments", commentId),
      { text: trimmedText },
      { merge: true }
    );

    return true;
  };

  const deleteComment = async (commentId: string) => {
    if (!room) return;

    const currentComment = comments.find((comment) => comment.id === commentId);
    if (!currentComment || currentComment.fromUid !== user?.uid) return;

    if (isDemoMode) {
      setComments((currentComments) =>
        currentComments.filter((comment) => comment.id !== commentId)
      );
      return;
    }

    await deleteDoc(doc(db, "rooms", room.id, "comments", commentId));
  };

  const deleteTodo = async (todoId: string, dayIndex = activeDay) => {
    const currentEntry = entries.find(
      (entry) => entry.uid === user?.uid && entry.dayIndex === dayIndex
    );
    if (!currentEntry) return;

    if (isDemoMode) {
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          entry.id === currentEntry.id
            ? {
                ...entry,
                todos: entry.todos.filter((todo) => todo.id !== todoId),
                updatedAt: getTimestamp(),
              }
            : entry
        )
      );
      return;
    }

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

      if (isDemoMode && user && room) {
        setPhotoPosts((currentPhotoPosts) => [
          {
            id: photoId,
            uid: user.uid,
            userName: room.members[user.uid]?.name ?? "나",
            userPhotoURL: room.members[user.uid]?.photoURL ?? "",
            weekId,
            dayIndex,
            dataUrl: photoDataUrl,
            createdAt: timestamp,
            updatedAt: timestamp,
            source: "post",
          },
          ...currentPhotoPosts,
        ]);
        setMessage("데모에 사진을 추가했어요!");
        return;
      }

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

    if (isDemoMode) {
      setPhotoPosts((currentPhotoPosts) =>
        currentPhotoPosts.filter((photoPost) => photoPost.id !== photo.id)
      );
      setMessage("데모에서 사진을 삭제했어요!");
      return;
    }

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
  const visibleLikeNotifications = useMemo(
    () =>
      likeNotifications.filter(
        (notification) => !dismissedNotificationIds.includes(notification.id)
      ),
    [dismissedNotificationIds, likeNotifications]
  );

  const saveDismissedNotificationIds = (nextIds: string[]) => {
    if (notificationStorageKey) {
      setDismissedNotificationIdsByKey((currentIdsByKey) => ({
        ...currentIdsByKey,
        [notificationStorageKey]: nextIds,
      }));

      localStorage.setItem(notificationStorageKey, JSON.stringify(nextIds));
    }
  };

  const deleteNotification = (notificationId: string) => {
    if (dismissedNotificationIds.includes(notificationId)) return;

    saveDismissedNotificationIds([
      ...dismissedNotificationIds,
      notificationId,
    ]);
  };

  const deleteAllNotifications = () => {
    saveDismissedNotificationIds(likeNotifications.map((notification) => notification.id));
  };

  if (!user) {
    return <AuthScreen onLogin={() => void login()} />;
  }

  if (!room) {
    return (
      <RoomLoadingScreen
        displayName={user.displayName}
        inviteCode={inviteCode}
        message={message}
      />
    );
  }

  if (isProfileOpen) {
    return (
      <ProfilePage
        activeProfileTab={activeProfileTab}
        addTodo={addTodo}
        canChangeNickname={canChangeNickname}
        deletePhoto={deletePhoto}
        deleteTodo={deleteTodo}
        editingTodoKey={editingTodoKey}
        editingTodoText={editingTodoText}
        formatDotDate={formatDotDate}
        formatTodoPeriod={formatTodoPeriod}
        isEditingNickname={isEditingNickname}
        isSavingPhoto={isSavingPhoto}
        isSavingProfilePhoto={isSavingProfilePhoto}
        likes={likes}
        myMember={myMember}
        myPhotoEntries={myPhotoEntries}
        myTodoGroups={myTodoGroups}
        nicknameText={nicknameText}
        onBack={() => setIsProfileOpen(false)}
        openPhotoMenuId={openPhotoMenuId}
        setActiveProfileTab={setActiveProfileTab}
        setEditingNickname={setIsEditingNickname}
        setEditingTodoKey={setEditingTodoKey}
        setEditingTodoText={setEditingTodoText}
        setMessage={setMessage}
        setNicknameText={setNicknameText}
        setOpenPhotoMenuId={setOpenPhotoMenuId}
        setTodoText={setTodoText}
        todoText={todoText}
        updateNickname={updateNickname}
        updateProfilePhoto={updateProfilePhoto}
        updateTodo={updateTodo}
        updateTodoText={updateTodoText}
        uploadProfileComposerPhoto={uploadProfileComposerPhoto}
      />
    );
  }

  if (isNotificationsOpen) {
    return (
      <NotificationsPage
        formatHour={formatDateTime}
        likeNotifications={visibleLikeNotifications}
        onBack={() => setIsNotificationsOpen(false)}
        onDeleteAll={deleteAllNotifications}
        onDeleteNotification={deleteNotification}
      />
    );
  }

  return (
    <HomePage
      activeDayRef={activeDayRef}
      activeStoryIndex={activeStoryIndex}
      activeStoryItem={activeStoryItem}
      allPhotoPosts={allPhotoPosts}
      comments={comments}
      dayStripRef={dayStripRef}
      editingTodoKey={editingTodoKey}
      editingTodoText={editingTodoText}
      entries={entries}
      formatHour={formatHour}
      formatShortDate={formatShortDate}
      formatTodoPeriod={formatTodoPeriod}
      isProgrammaticDayScrollRef={isProgrammaticDayScrollRef}
      isSavingPhoto={isSavingPhoto}
      likeNotifications={visibleLikeNotifications}
      likes={likes}
      members={members}
      message={message}
      myMember={myMember}
      onAddTodo={addTodo}
      onAddComment={addComment}
      onCloseStory={closeStory}
      onDeleteComment={deleteComment}
      onDeleteTodo={deleteTodo}
      onNextStory={showNextStory}
      onOpenNotifications={() => setIsNotificationsOpen(true)}
      onOpenProfile={() => setIsProfileOpen(true)}
      onOpenStory={openStory}
      onPhotoChange={uploadProfileComposerPhoto}
      onPreviousStory={showPreviousStory}
      onSetActiveDay={setActiveDay}
      onSetEditingTodoKey={setEditingTodoKey}
      onSetEditingTodoText={setEditingTodoText}
      onSetMessage={setMessage}
      onSetProfileTodoTab={() => setActiveProfileTab("todo")}
      onSetTodoText={setTodoText}
      onTogglePhotoLike={togglePhotoLike}
      onToggleTodo={updateTodo}
      onToggleTodoLike={toggleTodoLike}
      onUpdateComment={updateComment}
      onUpdateTodoText={updateTodoText}
      storyGroups={storyGroups}
      storyItems={storyItems}
      todoText={todoText}
      user={user}
    />
  );
}

export default App;
