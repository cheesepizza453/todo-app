import { BackIcon } from "../assets/icon/BackIcon";
import { HeartIcon } from "../assets/icon/HeartIcon";

type ProfileTab = "todo" | "photo";

type Member = {
  uid: string;
  name: string;
  photoURL: string;
};

type Todo = {
  completedAt?: number | null;
  createdAt: number;
  id: string;
  isDone: boolean;
  text: string;
};

type PhotoPost = {
  dataUrl: string;
  id: string;
  createdAt: number;
};

type LikeDocument = {
  entryId: string;
  itemType: "photo" | "todo";
};

type TodoGroup = {
  key: string;
  title: string;
  todos: Array<{
    dayIndex: number;
    todo: Todo;
  }>;
};

type MemberFeedPageProps = {
  activeTab: ProfileTab;
  formatDotDate: (timestamp?: number | null) => string;
  formatTodoPeriod: (todo: Todo) => string;
  likes: LikeDocument[];
  member: Member;
  onBack: () => void;
  photoEntries: PhotoPost[];
  setActiveTab: (tab: ProfileTab) => void;
  todoGroups: TodoGroup[];
};

export const MemberFeedPage = ({
  activeTab,
  formatDotDate,
  formatTodoPeriod,
  likes,
  member,
  onBack,
  photoEntries,
  setActiveTab,
  todoGroups,
}: MemberFeedPageProps) => (
  <main className="profile-screen">
    <header className="profile-header">
      <button className="" onClick={onBack} type="button">
        <BackIcon size={40} />
      </button>
      <h1>{member.name}</h1>
    </header>

    <section className="profile-panel">
      <div className="profile-photo-preview">
        {member.photoURL ? (
          <img src={member.photoURL} alt="" />
        ) : (
          <span>{member.name.slice(0, 1)}</span>
        )}
      </div>

      <div className="profile-nickname-view flex items-center gap-[5px]">
        <strong>{member.name}</strong>
      </div>

      <section className="profile-manage-panel w-full">
        <div className="profile-tabs" aria-label={`${member.name} 피드 선택`}>
          <button
            className={activeTab === "todo" ? "active" : ""}
            onClick={() => setActiveTab("todo")}
            type="button"
          >
            할 일 🥹
          </button>
          <button
            className={activeTab === "photo" ? "active" : ""}
            onClick={() => setActiveTab("photo")}
            type="button"
          >
            밥 💕
          </button>
        </div>

        {activeTab === "todo" ? (
          todoGroups.length ? (
            <div className="profile-todo-groups">
              {todoGroups.map((group) => (
                <section className="profile-todo-group" key={group.key}>
                  <h2>{group.title}</h2>
                  <ul>
                    {group.todos.map(({ todo }) => (
                      <li className={todo.isDone ? "done" : ""} key={todo.id}>
                        <div className="profile-todo-swipe">
                          <div className="profile-todo-block my-todo-block">
                            <span className="text-[15px]">{todo.text}</span>
                            <time className="text-[10px]">
                              {formatTodoPeriod(todo)}
                            </time>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="my-[60px]">
              <figure>
                <img src="/empty.png" alt="" />
              </figure>
              <p className="empty-note">아직 등록한 할 일이 없어요.</p>
            </div>
          )
        ) : photoEntries.length ? (
          <div className="profile-photo-list">
            {photoEntries.map((photo) => {
              const photoLikes = likes.filter(
                (like) =>
                  like.itemType === "photo" && like.entryId === photo.id
              );

              return (
                <section className="profile-photo-card" key={photo.id}>
                  <img src={photo.dataUrl} alt={`${member.name}의 사진`} />
                  <div className="profile-photo-menu">
                    <div className="flex items-center gap-[2px] text-[14px] text-[#27934a]">
                      <HeartIcon
                        filled={photoLikes.length > 0}
                        color="#27934a"
                      />
                      <p className="text-[#333333] font-normal">
                        {photoLikes.length}
                      </p>
                    </div>
                    <time className="text-[#333333] font-normal text-[12px]">
                      {formatDotDate(photo.createdAt)}
                    </time>
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="my-[60px]">
            <figure>
              <img src="/empty.png" alt="" />
            </figure>
            <p className="empty-note">아직 등록한 밥짤이 없어요.</p>
          </div>
        )}
      </section>
    </section>
  </main>
);
