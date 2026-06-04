import type { ChangeEvent, FormEvent } from "react";
import { BackIcon } from "../assets/icon/BackIcon";
import { HeartIcon } from "../assets/icon/HeartIcon";
import { PencilIcon } from "../assets/icon/PencilIcon";
import { PlusIcon } from "../assets/icon/PlusIcon";
import { TodoComposer } from "./TodoComposer";

type ProfileTab = "todo" | "photo";

type Member = {
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
  dayIndex: number;
  entryId?: string;
  createdAt: number;
  id: string;
  source?: "entry" | "post";
  uid: string;
  updatedAt: number;
  userName: string;
  userPhotoURL: string;
  weekId: string;
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

type ProfileScreenProps = {
  activeProfileTab: ProfileTab;
  addTodo: () => Promise<boolean>;
  canChangeNickname: boolean;
  deletePhoto: (photo: PhotoPost) => void;
  deleteTodo: (todoId: string, dayIndex: number) => void;
  editingTodoKey: string;
  editingTodoText: string;
  formatDotDate: (timestamp?: number | null) => string;
  formatTodoPeriod: (todo: Todo) => string;
  isEditingNickname: boolean;
  isSavingPhoto: boolean;
  isSavingProfilePhoto: boolean;
  likes: LikeDocument[];
  myMember?: Member | null;
  myPhotoEntries: PhotoPost[];
  myTodoGroups: TodoGroup[];
  nicknameText: string;
  onBack: () => void;
  openPhotoMenuId: string;
  setActiveProfileTab: (tab: ProfileTab) => void;
  setEditingNickname: (isEditing: boolean) => void;
  setEditingTodoKey: (key: string) => void;
  setEditingTodoText: (text: string) => void;
  setMessage: (message: string) => void;
  setNicknameText: (text: string) => void;
  setOpenPhotoMenuId: (photoId: string) => void;
  setTodoText: (text: string) => void;
  todoText: string;
  updateNickname: (event: FormEvent<HTMLFormElement>) => void;
  updateProfilePhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  updateTodo: (
    todoId: string,
    nextIsDone: boolean,
    dayIndex: number
  ) => Promise<void>;
  updateTodoText: (todoId: string, dayIndex: number) => Promise<void>;
  uploadProfileComposerPhoto: (event: ChangeEvent<HTMLInputElement>) => void;
};

export const ProfileScreen = ({
  activeProfileTab,
  addTodo,
  canChangeNickname,
  deletePhoto,
  deleteTodo,
  editingTodoKey,
  editingTodoText,
  formatDotDate,
  formatTodoPeriod,
  isEditingNickname,
  isSavingPhoto,
  isSavingProfilePhoto,
  likes,
  myMember,
  myPhotoEntries,
  myTodoGroups,
  nicknameText,
  onBack,
  openPhotoMenuId,
  setActiveProfileTab,
  setEditingNickname,
  setEditingTodoKey,
  setEditingTodoText,
  setMessage,
  setNicknameText,
  setOpenPhotoMenuId,
  setTodoText,
  todoText,
  updateNickname,
  updateProfilePhoto,
  updateTodo,
  updateTodoText,
  uploadProfileComposerPhoto,
}: ProfileScreenProps) => (
  <main className="profile-screen">
    <header className="profile-header">
      <button className="" onClick={onBack} type="button">
        <BackIcon size={40} />
      </button>
      <h1>마이</h1>
    </header>

    <section className="profile-panel">
      <div className="relative">
        <div className="profile-photo-preview">
          {myMember?.photoURL ? (
            <img src={myMember.photoURL} alt="" />
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
          {isSavingProfilePhoto ? "저장 중" : <PencilIcon size={25} />}
        </label>
      </div>

      {canChangeNickname && isEditingNickname ? (
        <form
          className="profile-nickname-form flex justify-center gap-1"
          onSubmit={updateNickname}
        >
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
            className="px-[15px] bg-transparent text-[#333333] text-[12px]"
            disabled={!nicknameText.trim()}
            type="submit"
          >
            저장
          </button>
          <button
            className="px-[15px] bg-transparent text-[#333333] text-[12px]"
            onClick={() => {
              setNicknameText("");
              setEditingNickname(false);
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
              className="min-h-0 text-[12px]"
              onClick={() => {
                setNicknameText(myMember?.name ?? "");
                setEditingNickname(true);
              }}
              type="button"
            >
              수정
            </button>
          ) : (
            ""
          )}
        </div>
      )}

      <section className="profile-manage-panel w-full">
        <div className="profile-tabs" aria-label="마이 보기 선택">
          <button
            className={activeProfileTab === "todo" ? "active" : ""}
            onClick={() => setActiveProfileTab("todo")}
            type="button"
          >
            내 할 일 🥹
          </button>
          <button
            className={activeProfileTab === "photo" ? "active" : ""}
            onClick={() => setActiveProfileTab("photo")}
            type="button"
          >
            내 밥 💕
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
                        <li className={todo.isDone ? "done" : ""} key={todo.id}>
                          <div className="profile-todo-swipe">
                            {isEditingTodo ? (
                              <div className="profile-edit-row relative flex justify-start">
                                <input
                                  className="w-[55vw]"
                                  autoFocus
                                  maxLength={255}
                                  onChange={(event) =>
                                    setEditingTodoText(event.target.value)
                                  }
                                  value={editingTodoText}
                                />
                                <button
                                  className="w-[45px]"
                                  disabled={!editingTodoText.trim()}
                                  onClick={() =>
                                    void updateTodoText(todo.id, dayIndex)
                                  }
                                  type="button"
                                >
                                  저장
                                </button>
                                <button
                                  className="w-[45px]"
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
                                      setMessage("멋져요! 할 일을 완료했어요!");
                                    }
                                  }}
                                  type="button"
                                >
                                  <span className="text-[15px]">{todo.text}</span>
                                  <time className="text-[10px]">
                                    {formatTodoPeriod(todo)}
                                  </time>
                                </button>
                                <div className="profile-item-actions">
                                  <button
                                    className=""
                                    onClick={() => {
                                      setEditingTodoKey(todoKey);
                                      setEditingTodoText(todo.text);
                                    }}
                                    type="button"
                                  >
                                    수정
                                  </button>
                                  <button
                                    onClick={() => deleteTodo(todo.id, dayIndex)}
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
            <div className="my-[60px]">
              <figure>
                <img src="/empty.png" alt="" />
              </figure>
              <p className="empty-note">
                아직 등록한 할 일이 없어요.
                <br />
                아래에서 작성해 보세요!
              </p>
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
                    <PlusIcon />
                  </button>

                  {isPhotoMenuOpen && (
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
                      <div>
                        <time className="text-[#333333] font-normal text-[12px]">
                          {formatDotDate(photo.createdAt)}
                        </time>
                        <button
                          className="min-h-[20px] text-[#333333] font-normal text-[12px] text-right font-bold"
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
          <div className="my-[60px]">
            <figure>
              <img src="/empty.png" alt="" />
            </figure>
            <p className="empty-note">
              아직 등록한 밥짤이 없어요.
              <br />
              아래 왼쪽 버튼을 눌러 올려보세요!
            </p>
          </div>
        )}
      </section>
    </section>

    <TodoComposer
      isSavingPhoto={isSavingPhoto}
      onPhotoChange={uploadProfileComposerPhoto}
      onSubmitTodo={addTodo}
      onTodoAdded={() => setActiveProfileTab("todo")}
      setTodoText={setTodoText}
      todoText={todoText}
    />
  </main>
);
