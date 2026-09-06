/** Presentation-only accents for the five fixed board columns, in board order. */
export type ColumnAccent = {
  /** Solid accent used for rails, dots, and focus rings. */
  color: string;
  /** Translucent version of the same accent for badges and hover surfaces. */
  soft: string;
};

const accents: ColumnAccent[] = [
  { color: "#888888", soft: "rgba(136, 136, 136, 0.14)" },
  { color: "#ecad0a", soft: "rgba(236, 173, 10, 0.16)" },
  { color: "#209dd7", soft: "rgba(32, 157, 215, 0.14)" },
  { color: "#753991", soft: "rgba(117, 57, 145, 0.14)" },
  { color: "#032147", soft: "rgba(3, 33, 71, 0.10)" },
];

export const columnAccent = (index: number): ColumnAccent =>
  accents[((index % accents.length) + accents.length) % accents.length];
