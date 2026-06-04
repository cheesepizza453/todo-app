import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent, RefObject } from "react";
import type { User } from "firebase/auth";
import { CloseIcon } from "../assets/icon/CloseIcon";
import { HeartIcon } from "../assets/icon/HeartIcon";
import { PencilIcon } from "../assets/icon/PencilIcon";
import { AppHeader } from "../components/AppHeader";
import { StoryRail, StoryViewer } from "../components/AppComponents";
import { TodoComposer } from "../components/TodoComposer";

type Member = {
  uid: string;
  name: string;
  photoURL: string;
};

type Todo = {
  id: string;
  text: string;
  isDone: boolean;
  createdAt: number;
  completedAt?: number | null;
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

type LikeDocument = {
  id: string;
  itemType: "photo" | "todo";
  entryId: string;
  todoId: string;
  fromUid: string;
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

type LikeNotification = {
  id: string;
  fromName: string;
  fromPhotoURL: string;
  createdAt: number;
  message: string;
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

type StoryGroup = {
  member: Member;
  items: StoryItem[];
};

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

type HomePageProps = {
  activeDayRef: RefObject<number>;
  activeStoryIndex: number;
  activeStoryItem: StoryItem | null;
  allPhotoPosts: PhotoPost[];
  comments: CommentDocument[];
  dayStripRef: RefObject<HTMLDivElement | null>;
  editingTodoKey: string;
  editingTodoText: string;
  entries: Entry[];
  formatHour: (timestamp?: number | null) => string;
  formatShortDate: (timestamp?: number | null) => string;
  formatTodoPeriod: (todo: Todo) => string;
  isProgrammaticDayScrollRef: RefObject<boolean>;
  isSavingPhoto: boolean;
  likeNotifications: LikeNotification[];
  likes: LikeDocument[];
  members: Member[];
  message: string;
  myMember: Member | null;
  onAddComment: (
    itemType: "photo" | "todo",
    entryId: string,
    todoId: string,
    ownerUid: string,
    dayIndex: number,
    text: string
  ) => Promise<boolean>;
  onAddTodo: () => Promise<boolean>;
  onCloseStory: () => void;
  onDeleteComment: (commentId: string) => void | Promise<void>;
  onDeleteTodo: (todoId: string, dayIndex: number) => void;
  onNextStory: () => void;
  onOpenNotifications: () => void;
  onOpenMemberFeed: (memberUid: string) => void;
  onOpenProfile: () => void;
  onOpenStory: (memberUid: string) => void;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPreviousStory: () => void;
  onSetActiveDay: (dayIndex: number) => void;
  onSetEditingTodoKey: (key: string) => void;
  onSetEditingTodoText: (text: string) => void;
  onSetMessage: (message: string) => void;
  onSetProfileTodoTab: () => void;
  onSetTodoText: (text: string) => void;
  onTogglePhotoLike: (photo: PhotoPost) => void | Promise<void>;
  onToggleTodo: (
    todoId: string,
    nextIsDone: boolean,
    dayIndex: number
  ) => void | Promise<void>;
  onToggleTodoLike: (entry: Entry, todoId: string) => void | Promise<void>;
  onUpdateComment: (commentId: string, text: string) => Promise<boolean>;
  onUpdateTodoText: (todoId: string, dayIndex: number) => void | Promise<void>;
  storyGroups: StoryGroup[];
  storyItems: StoryItem[];
  todoText: string;
  user: User;
};

type CommentPanelProps = {
  comments: CommentDocument[];
  itemType: "photo" | "todo";
  entryId: string;
  todoId: string;
  ownerUid: string;
  dayIndex: number;
  onAddComment: HomePageProps["onAddComment"];
  onDeleteComment: HomePageProps["onDeleteComment"];
  onUpdateComment: HomePageProps["onUpdateComment"];
  userUid: string;
};

type MemberTopProps = {
  actionText?: string;
  member: Member;
  subtitle: string;
  onOpenMemberFeed: (memberUid: string) => void;
};

const MemberTop = ({
  actionText,
  member,
  onOpenMemberFeed,
  subtitle,
}: MemberTopProps) => (
  <button
    className="friend-top feed-member-button"
    onClick={(event) => {
      event.stopPropagation();
      onOpenMemberFeed(member.uid);
    }}
    type="button"
  >
    {member.photoURL ? (
      <figure className="relative w-[42px] h-[42px] overflow-hidden">
        <img
          className="w-full h-full object-cover"
          src={member.photoURL}
          alt=""
        />
      </figure>
    ) : (
      <div className="avatar-fallback">{member.name.slice(0, 1)}</div>
    )}

    <div className="gap-0">
      <strong>
        {member.name}
        {actionText && (
          <p className="inline ml-[2px] font-black text-green">
            {actionText}
          </p>
        )}
      </strong>
      <span className="text-[10px]">{subtitle}</span>
    </div>
  </button>
);

const CommentPanel = ({
  comments,
  dayIndex,
  entryId,
  itemType,
  onAddComment,
  onDeleteComment,
  onUpdateComment,
  ownerUid,
  todoId,
  userUid,
}: CommentPanelProps) => {
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const [editingCommentId, setEditingCommentId] = useState("");
  const [editingCommentText, setEditingCommentText] = useState("");
  const itemComments = comments
    .filter(
      (comment) =>
        comment.itemType === itemType &&
        comment.entryId === entryId &&
        comment.todoId === todoId
    )
    .sort((firstComment, secondComment) => firstComment.createdAt - secondComment.createdAt);

  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextComment = commentInputRef.current?.value.trim() ?? "";
    if (!nextComment) return;

    void onAddComment(
      itemType,
      entryId,
      todoId,
      ownerUid,
      dayIndex,
      nextComment
    ).then((didAddComment) => {
      if (didAddComment && commentInputRef.current) {
        commentInputRef.current.value = "";
      }
    });
  };

  return (
    <section
      className="comment-panel"
      onClick={(event) => event.stopPropagation()}
      role="presentation"
    >
      {itemComments.length > 0 && (
        <div className="comment-list">
          {itemComments.map((comment) => (
            <article className="comment-item" key={comment.id}>
              {comment.fromPhotoURL ? (
                <img src={comment.fromPhotoURL} alt="" />
              ) : (
                <span>{comment.fromName.slice(0, 1)}</span>
              )}
              <div>
                {editingCommentId === comment.id ? (
                  <form
                    className="comment-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onUpdateComment(
                        comment.id,
                        editingCommentText
                      ).then((didUpdateComment) => {
                        if (didUpdateComment) {
                          setEditingCommentId("");
                          setEditingCommentText("");
                        }
                      });
                    }}
                  >
                    <input
                      autoFocus
                      maxLength={120}
                      onChange={(event) =>
                        setEditingCommentText(event.target.value)
                      }
                      value={editingCommentText}
                    />
                    <button
                      disabled={!editingCommentText.trim()}
                      type="submit"
                      title="댓글 수정 저장"
                    >
                      저장
                    </button>
                  </form>
                ) : (
                  <>
                    <p>
                      <strong>{comment.fromName}</strong>
                      {comment.text}
                    </p>
                    <time>{formatCommentDate(comment.createdAt)}</time>
                  </>
                )}
              </div>
              {comment.fromUid === userUid && (
                <div className="comment-actions">
                  <button
                    onClick={() => {
                      if (editingCommentId === comment.id) {
                        setEditingCommentId("");
                        setEditingCommentText("");
                        return;
                      }

                      setEditingCommentId(comment.id);
                      setEditingCommentText(comment.text);
                    }}
                    title="댓글 수정"
                    type="button"
                  >
                    <PencilIcon size={14} />
                  </button>
                  <button
                    onClick={() => onDeleteComment(comment.id)}
                    title="댓글 삭제"
                    type="button"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <form className="comment-form" onSubmit={submitComment}>
        <input
          maxLength={120}
          ref={commentInputRef}
          placeholder="댓글 달기"
        />
        <button type="submit">
          게시
        </button>
      </form>
    </section>
  );
};

const formatCommentDate = (timestamp?: number | null) => {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  return `${String(date.getFullYear()).slice(2)}년 ${
    date.getMonth() + 1
  }월 ${date.getDate()}일 ${date.getHours()}시 ${date.getMinutes()}분`;
};

export const HomePage = ({
  activeDayRef,
  activeStoryIndex,
  activeStoryItem,
  allPhotoPosts,
  comments,
  dayStripRef,
  editingTodoKey,
  editingTodoText,
  entries,
  formatHour,
  formatShortDate,
  formatTodoPeriod,
  isProgrammaticDayScrollRef,
  isSavingPhoto,
  likeNotifications,
  likes,
  members,
  message,
  myMember,
  onAddComment,
  onAddTodo,
  onCloseStory,
  onDeleteComment,
  onDeleteTodo,
  onNextStory,
  onOpenNotifications,
  onOpenMemberFeed,
  onOpenProfile,
  onOpenStory,
  onPhotoChange,
  onPreviousStory,
  onSetActiveDay,
  onSetEditingTodoKey,
  onSetEditingTodoText,
  onSetMessage,
  onSetProfileTodoTab,
  onSetTodoText,
  onTogglePhotoLike,
  onToggleTodo,
  onToggleTodoLike,
  onUpdateComment,
  onUpdateTodoText,
  storyGroups,
  storyItems,
  todoText,
  user,
}: HomePageProps) => {
  return (
  <main className="app-shell py-[20px]">
    <AppHeader
      likeCount={likeNotifications.length}
      myMember={myMember}
      onOpenNotifications={onOpenNotifications}
      onOpenProfile={onOpenProfile}
    />

    <StoryRail onOpenStory={onOpenStory} storyGroups={storyGroups} />

    <section
      className="day-strip"
      ref={dayStripRef}
      onScroll={(event) => {
        if (isProgrammaticDayScrollRef.current) return;

        const width = event.currentTarget.clientWidth;
        const nextIndex = Math.round(event.currentTarget.scrollLeft / width);
        const clampedIndex = Math.min(6, Math.max(0, nextIndex));
        activeDayRef.current = clampedIndex;
        onSetActiveDay(clampedIndex);
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
        const todoFeedItems = entries.flatMap<FeedItem>((entry) => {
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
        const feedItems = [...photoFeedItems, ...todoFeedItems].sort(
          (firstItem, secondItem) => secondItem.timestamp - firstItem.timestamp
        );
        return (
          <article className="day-slide px-[15px] pb-[100px]">
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
                      <section className="friend-card p-[14px]" key={item.key}>
                        <MemberTop
                          member={item.member}
                          onOpenMemberFeed={onOpenMemberFeed}
                          subtitle={formatShortDate(item.photo.createdAt)}
                        />

                        <div className="photo-frame flex items-center justify-center w-full aspect-[4/3] rounded-[6px] overflow-hidden">
                          <img
                            className="daily-photo w-full h-full object-cover"
                            src={item.photo.dataUrl}
                            alt={`${item.member.name}의 하루 사진`}
                          />
                        </div>

                        <button
                          className={`flex gap-[2px] ${
                            hasLikedPhoto ? "active text-[#4cb46e]" : ""
                          }`}
                          onClick={() => onTogglePhotoLike(item.photo)}
                          type="button"
                        >
                          <HeartIcon
                            className="mt-[1px]"
                            filled={photoLikes.length > 0}
                          />{" "}
                          <span className="text-[#333333]">
                            {photoLikes.length}
                          </span>
                        </button>
                        <CommentPanel
                          comments={comments}
                          dayIndex={item.photo.dayIndex}
                          entryId={item.photo.id}
                          itemType="photo"
                          onAddComment={onAddComment}
                          onDeleteComment={onDeleteComment}
                          onUpdateComment={onUpdateComment}
                          ownerUid={item.photo.uid}
                          todoId=""
                          userUid={user.uid}
                        />
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
                        className="relative friend-card todo-complete-card p-[14px] overflow-hidden bg-[#fdfbf4]"
                        key={item.key}
                      >
                        <MemberTop
                          actionText="님이 할 일을 해냈어요!"
                          member={item.member}
                          onOpenMemberFeed={onOpenMemberFeed}
                          subtitle={formatTodoPeriod(item.todo)}
                        />

                        <p className="flex items-center">
                          <strong className="underline single-todo-row">
                            {item.todo.text}
                          </strong>
                        </p>
                        <button
                          className={`flex gap-[2px] ${
                            hasLikedTodo ? "active text-[#4cb46e]" : ""
                          }`}
                          onClick={() => onToggleTodoLike(item.entry, item.todo.id)}
                          type="button"
                        >
                          <HeartIcon
                            className="mt-[1px]"
                            filled={todoLikes.length > 0}
                          />{" "}
                          <span className="text-[#333333]">
                            {todoLikes.length}
                          </span>
                        </button>
                        <CommentPanel
                          comments={comments}
                          dayIndex={item.entry.dayIndex}
                          entryId={item.entry.id}
                          itemType="todo"
                          onAddComment={onAddComment}
                          onDeleteComment={onDeleteComment}
                          onUpdateComment={onUpdateComment}
                          ownerUid={item.entry.uid}
                          todoId={item.todo.id}
                          userUid={user.uid}
                        />
                        <figure className="absolute bottom-[-30px] right-[-20px] w-[170px] inline-block opacity-45">
                          <img className="w-full" src="/stamp.png" alt="스탬프" />
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
                            className="friend-card feed-todo-card-body p-[14px]"
                            onClick={() => {
                              if (
                                editingTodoKey ===
                                `${item.entry.dayIndex}_${item.todo.id}`
                              ) {
                                return;
                              }

                              const nextIsDone = !item.todo.isDone;
                              onToggleTodo(
                                item.todo.id,
                                nextIsDone,
                                item.entry.dayIndex
                              );

                              if (nextIsDone) {
                                onSetMessage("멋져요! 할 일을 완료했어요!");
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
                            <MemberTop
                              member={item.member}
                              onOpenMemberFeed={onOpenMemberFeed}
                              subtitle={formatShortDate(item.todo.createdAt)}
                            />

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
                                    onSetEditingTodoText(event.target.value)
                                  }
                                  value={editingTodoText}
                                />
                                <button
                                  disabled={!editingTodoText.trim()}
                                  onClick={() =>
                                    onUpdateTodoText(
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
                                    onSetEditingTodoKey("");
                                    onSetEditingTodoText("");
                                  }}
                                  type="button"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <div className="profile-todo-block">
                                <span className="text-[15px]">
                                  {item.todo.text}
                                </span>
                              </div>
                            )}
                            <button
                              className={`flex gap-[2px] ${
                                hasLikedTodo ? "active text-[#4cb46e]" : ""
                              }`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onToggleTodoLike(item.entry, item.todo.id);
                              }}
                              type="button"
                            >
                              <HeartIcon
                                className="mt-[1px]"
                                filled={todoLikes.length > 0}
                              />{" "}
                              <span
                                className={
                                  item.todo.isDone
                                    ? "text-[#ffffff]"
                                    : "text-[#333333]"
                                }
                              >
                                {todoLikes.length}
                              </span>
                            </button>
                            <CommentPanel
                              comments={comments}
                              dayIndex={item.entry.dayIndex}
                              entryId={item.entry.id}
                              itemType="todo"
                              onAddComment={onAddComment}
                              onDeleteComment={onDeleteComment}
                              onUpdateComment={onUpdateComment}
                              ownerUid={item.entry.uid}
                              todoId={item.todo.id}
                              userUid={user.uid}
                            />
                          </article>
                          <div className="profile-item-actions">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                onSetEditingTodoKey(
                                  `${item.entry.dayIndex}_${item.todo.id}`
                                );
                                onSetEditingTodoText(item.todo.text);
                              }}
                              type="button"
                            >
                              수정
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteTodo(item.todo.id, item.entry.dayIndex);
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
                      className={`friend-card todo-feed-card p-[14px] ${
                        item.todo.isDone ? "done" : ""
                      }`}
                      key={item.key}
                    >
                      <MemberTop
                        member={item.member}
                        onOpenMemberFeed={onOpenMemberFeed}
                        subtitle={formatShortDate(item.todo.createdAt)}
                      />

                      <div className="single-todo-row">
                        <span>{item.todo.text}</span>
                      </div>
                      <button
                        className={`flex gap-[2px] ${
                          hasLikedTodo ? "active text-[#4cb46e]" : ""
                        }`}
                        onClick={() => onToggleTodoLike(item.entry, item.todo.id)}
                        type="button"
                      >
                        <HeartIcon
                          className="mt-[1px]"
                          filled={todoLikes.length > 0}
                        />{" "}
                        <span className="text-[#333333]">
                          {todoLikes.length}
                        </span>
                      </button>
                      <CommentPanel
                        comments={comments}
                        dayIndex={item.entry.dayIndex}
                        entryId={item.entry.id}
                        itemType="todo"
                        onAddComment={onAddComment}
                        onDeleteComment={onDeleteComment}
                        onUpdateComment={onUpdateComment}
                        ownerUid={item.entry.uid}
                        todoId={item.todo.id}
                        userUid={user.uid}
                      />
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

    <StoryViewer
      activeStoryIndex={activeStoryIndex}
      activeStoryItem={activeStoryItem}
      formatHour={formatHour}
      formatTodoPeriod={formatTodoPeriod}
      onClose={onCloseStory}
      onNext={onNextStory}
      onPrevious={onPreviousStory}
      storyItems={storyItems}
    />

    <TodoComposer
      isSavingPhoto={isSavingPhoto}
      onPhotoChange={onPhotoChange}
      onSubmitTodo={onAddTodo}
      onTodoAdded={onSetProfileTodoTab}
      setTodoText={onSetTodoText}
      todoText={todoText}
    />

    {message && <p className="toast">{message}</p>}
  </main>
  );
};
