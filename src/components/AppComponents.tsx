type NamedMember = {
  name: string;
  photoURL: string;
  uid: string;
};

type ToastProps = {
  message: string;
};

export const Toast = ({ message }: ToastProps) =>
  message ? <p className="toast">{message}</p> : null;

type AuthScreenProps = {
  onLogin: () => void;
};

export const AuthScreen = ({ onLogin }: AuthScreenProps) => (
  <main className="relative bg-[#fdfbf4] text-center w-[100vw] h-[80vh] flex justify-center items-start pt-[90px] px-[30px]">
    <div className="flex flex-col justify-center items-center pb-[300px]">
      <p className="text-[32px] text-center text-[#343333] font-bold leading-[1.4]">
        소소하게 갓생 응원하고
        <br />
        뭐 먹었는지 공유해요
      </p>
      <section className="mt-[6px] w-full">
        <figure className="mt-50px] max-w-[700px]">
          <img src="/main-1.jpg" alt="" />
        </figure>
        <div className="absolute bottom-[30px] left-0 w-full overflow-hidden">
          <button
            className="rounded-[6px] w-[calc(100%-60px)] max-w-[800px] py-[15px] bg-[#333333] text-white font-normal"
            onClick={onLogin}
            type="button"
          >
            구글로 시작해줘
          </button>
        </div>
      </section>
    </div>
  </main>
);

type RoomLoadingScreenProps = {
  displayName: string | null;
  inviteCode: string;
  message: string;
};

export const RoomLoadingScreen = ({
  displayName,
  inviteCode,
  message,
}: RoomLoadingScreenProps) => (
  <main className="room-screen">
    <header className="top-bar">
      <div>
        <strong>{displayName}</strong>
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

    <Toast message={message} />
  </main>
);

type StoryRailProps = {
  onOpenStory: (memberUid: string) => void;
  storyGroups: Array<{
    member: NamedMember;
  }>;
};

export const StoryRail = ({ onOpenStory, storyGroups }: StoryRailProps) =>
  storyGroups.length > 0 ? (
    <section className="story-rail px-[18px] pb-[14px]" aria-label="스토리">
      {storyGroups.map((group) => (
        <button
          className="story-bubble"
          key={group.member.uid}
          onClick={() => onOpenStory(group.member.uid)}
          type="button"
        >
          <figure className="w-[56px] h-[56px] rounded-full overflow-hidden border-2 border-[#4cb46e]">
            {group.member.photoURL ? (
              <img
                className="w-full h-full object-cover"
                src={group.member.photoURL}
                alt=""
              />
            ) : (
              group.member.name.slice(0, 1)
            )}
          </figure>
          <strong>{group.member.name}</strong>
        </button>
      ))}
    </section>
  ) : null;

type StoryViewerTodo = {
  completedAt?: number | null;
  createdAt: number;
  id: string;
  isDone: boolean;
  text: string;
};

type StoryViewerItem =
  | {
      key: string;
      member: NamedMember;
      photo: {
        dataUrl: string;
      };
      timestamp: number;
      type: "photo";
    }
  | {
      key: string;
      member: NamedMember;
      timestamp: number;
      todo: StoryViewerTodo;
      type: "todoDone";
    };

type StoryViewerProps = {
  activeStoryIndex: number;
  activeStoryItem?: StoryViewerItem | null;
  formatHour: (timestamp?: number | null) => string;
  formatTodoPeriod: (todo: StoryViewerTodo) => string;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  storyItems: StoryViewerItem[];
};

export const StoryViewer = ({
  activeStoryIndex,
  activeStoryItem,
  formatHour,
  formatTodoPeriod,
  onClose,
  onNext,
  onPrevious,
  storyItems,
}: StoryViewerProps) =>
  activeStoryItem ? (
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
        <button
          className="bg-transparent text-[12px]"
          onClick={onClose}
          type="button"
        >
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
          className="bg-transparent text-[14px]"
          disabled={activeStoryIndex === 0}
          onClick={onPrevious}
          type="button"
        >
          이전
        </button>
        <button
          className="bg-transparent text-[14px]"
          disabled={activeStoryIndex >= storyItems.length - 1}
          onClick={onNext}
          type="button"
        >
          다음
        </button>
      </div>
    </div>
  ) : null;
