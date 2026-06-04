import type { ChangeEvent } from "react";
import { PhotoIcon } from "../assets/icon/PhotoIcon";

type TodoComposerProps = {
  isSavingPhoto: boolean;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmitTodo: () => Promise<boolean>;
  onTodoAdded: () => void;
  setTodoText: (text: string) => void;
  todoText: string;
};

export const TodoComposer = ({
  isSavingPhoto,
  onPhotoChange,
  onSubmitTodo,
  onTodoAdded,
  setTodoText,
  todoText,
}: TodoComposerProps) => (
  <form
    className="profile-composer fixed gap-x-[10px] w-full flex items-center justify-between left-1/2 bottom-0 z-[18] -translate-x-1/2 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] backdrop-blur-[14px] px-[14px] py-[16px]"
    onSubmit={(event) => {
      event.preventDefault();
      void onSubmitTodo().then((didAddTodo) => {
        if (didAddTodo) {
          onTodoAdded();
        }
      });
    }}
  >
    <label className="profile-composer-photo-button flex items-center justify-center py-[7px] shrink-0">
      <input
        accept="image/*"
        disabled={isSavingPhoto}
        onChange={onPhotoChange}
        type="file"
      />
      <PhotoIcon size={30} />
    </label>
    <input
      className="min-w-0 flex-1 py-[10px]"
      maxLength={255}
      onChange={(event) => setTodoText(event.target.value)}
      placeholder="해야할 일을 입력해요"
      value={todoText}
    />
    <button
      className="text-[13px] py-[14px] px-[20px] bg-[#333] text-white shrink-0"
      disabled={!todoText.trim()}
      type="submit"
    >
      작성
    </button>
  </form>
);
