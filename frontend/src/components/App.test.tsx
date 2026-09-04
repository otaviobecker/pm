import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/components/App";
import { getBoard, getSession, login, logout } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  getSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getBoard: vi.fn(),
  createCard: vi.fn(),
  deleteCard: vi.fn(),
  editCard: vi.fn(),
  moveBoardCard: vi.fn(),
  renameColumn: vi.fn(),
  sendChat: vi.fn(),
}));

const mockedGetBoard = vi.mocked(getBoard);
const mockedGetSession = vi.mocked(getSession);
const mockedLogin = vi.mocked(login);
const mockedLogout = vi.mocked(logout);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetBoard.mockResolvedValue(structuredClone(initialData));
});

describe("App authentication", () => {
  it("shows sign-in when there is no session", async () => {
    mockedGetSession.mockResolvedValue(null);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /welcome back/i })
    ).toBeInTheDocument();
  });

  it("restores an authenticated session", async () => {
    mockedGetSession.mockResolvedValue({ username: "user" });

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("signs in with valid credentials", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedLogin.mockResolvedValue({ username: "user" });
    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(mockedLogin).toHaveBeenCalledWith("user", "password");
    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeInTheDocument();
  });

  it("shows an error for invalid credentials", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedLogin.mockRejectedValue(new Error("Unauthorized"));
    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password."
    );
  });

  it("logs out and returns to sign-in", async () => {
    mockedGetSession.mockResolvedValue({ username: "user" });
    mockedLogout.mockResolvedValue();
    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: /sign out/i })
    );

    expect(mockedLogout).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole("heading", { name: /welcome back/i })
    ).toBeInTheDocument();
  });
});
