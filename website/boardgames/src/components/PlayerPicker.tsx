import { User } from "lucide-react";

import { SIDE_LABEL, type Side, type User as UserModel } from "../types";
import { Avatar, RoleChip } from "./ui";

interface PlayerPickerProps {
  side: Side;
  users: UserModel[];
  value: number | null;
  /** ids, die auf der anderen Seite bereits gewählt sind. */
  taken: number[];
  onChange: (userId: number) => void;
}

/** Auswahl einer Person für eine der beiden Farbseiten. */
export function PlayerPicker({ side, users, value, taken, onChange }: PlayerPickerProps) {
  const selected = users.find((user) => user.id === value) ?? null;

  return (
    <div className="picker">
      <div className="picker__head">
        <span className={`side__dot side__dot--${side}`} aria-hidden="true" />
        <span className="picker__label">{SIDE_LABEL[side]}</span>
        <span className="picker__hint">{side === "red" ? "beginnt" : "zweite Seite"}</span>
      </div>

      <div className="picker__control">
        <select
          className="select"
          value={value ?? ""}
          aria-label={`Spieler:in für ${SIDE_LABEL[side]}`}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          <option value="">Bitte wählen …</option>
          {users.map((user) => (
            <option key={user.id} value={user.id} disabled={taken.includes(user.id)}>
              {user.username}
              {taken.includes(user.id) ? " (bereits gewählt)" : ""}
            </option>
          ))}
        </select>
        {selected ? (
          <span className="picker__selected">
            <Avatar user={selected} />
            <RoleChip role={selected.role} />
          </span>
        ) : (
          <span className="picker__selected picker__selected--empty">
            <User aria-hidden="true" size={16} /> noch offen
          </span>
        )}
      </div>
    </div>
  );
}
