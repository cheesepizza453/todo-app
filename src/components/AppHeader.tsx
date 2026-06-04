import { HeartIcon } from "../assets/icon/HeartIcon";

type HeaderMember = {
  name: string;
  photoURL: string;
};

type AppHeaderProps = {
  likeCount: number;
  myMember?: HeaderMember | null;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
};

export const AppHeader = ({
  likeCount,
  myMember,
  onOpenNotifications,
  onOpenProfile,
}: AppHeaderProps) => (
  <header className="room-header w-full bg-white px-[18px] pb-[16px]">
    <div className="w-full flex items-center justify-between header-icon-actions">
      <button
        className="profile-icon-button"
        onClick={onOpenProfile}
        type="button"
        title="프로필 수정"
      >
        {myMember?.photoURL ? (
          <img src={myMember.photoURL} alt="" />
        ) : (
          <span>{myMember?.name.slice(0, 1) ?? "나"}</span>
        )}
      </button>
      <button
        className="relative text-[12px]"
        onClick={onOpenNotifications}
        type="button"
        title="좋아요 알림"
      >
        <HeartIcon size={30} color="black" />
        {likeCount > 0 && (
          <span className="flex justify-center items-center absolute bottom-[22px] right-[-4px] rounded-full w-[16px] h-[16px] text-white bg-blue">
            {likeCount}
          </span>
        )}
      </button>
    </div>
  </header>
);
