import { BackIcon } from "../assets/icon/BackIcon";

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
};

export const NotificationsScreen = ({
  formatHour,
  likeNotifications,
  onBack,
}: NotificationsScreenProps) => (
  <main className="profile-screen">
    <header className="profile-header fixed top-0 left-0">
      <button className="" onClick={onBack} type="button">
        <BackIcon size={40} />
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
