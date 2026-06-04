import { BackIcon } from "../assets/icon/BackIcon";
import { CloseIcon } from "../assets/icon/CloseIcon";

type LikeNotification = {
  id: string;
  fromName: string;
  fromPhotoURL: string;
  createdAt: number;
  message: string;
};

type NotificationsScreenProps = {
  formatHour: (timestamp?: number | null) => string;
  likeNotifications: LikeNotification[];
  onBack: () => void;
  onDeleteAll: () => void;
  onDeleteNotification: (notificationId: string) => void;
};

export const NotificationsScreen = ({
  formatHour,
  likeNotifications,
  onBack,
  onDeleteAll,
  onDeleteNotification,
}: NotificationsScreenProps) => (
  <main className="profile-screen">
    <header className="profile-header fixed top-0 left-0 mt-[10px]">
      <button className="" onClick={onBack} type="button">
        <BackIcon size={40} />
      </button>
      <h1>알림</h1>
    </header>

    <section className="notification-list mt-[40px]">
      {likeNotifications.length > 0 && (
        <button
          className="notification-clear-button absolute top-[15px]"
          onClick={onDeleteAll}
          type="button"
        >
          전체삭제
        </button>
      )}
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
            <button
              className="notification-delete-button"
              onClick={() => onDeleteNotification(notification.id)}
              title="알림 삭제"
              type="button"
            >
              <CloseIcon size={16} />
            </button>
          </article>
        ))
      ) : (
        <div className="mt-[70px]">
          <figure>
            <img src={'/empty.png'} alt="" />
          </figure>
        <p className="empty-note">아직 받은 좋아요가 없어요.</p>
        </div>
      )}
    </section>
  </main>
);
