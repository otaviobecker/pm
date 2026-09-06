import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/components/App";
import {
  ApiError,
  getAllUsers,
  getBoard,
  getBoards,
  getDirectory,
  getSession,
  login,
  logout,
  register,
} from "@/lib/api";
import { makeBoard, makeSummary, makeUser } from "@/test/fixtures";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getSession: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getBoards: vi.fn(),
    getBoard: vi.fn(),
    getDirectory: vi.fn(),
    getAllUsers: vi.fn(),
  };
});

const mockedGetSession = vi.mocked(getSession);
const mockedLogin = vi.mocked(login);
const mockedRegister = vi.mocked(register);
const mockedLogout = vi.mocked(logout);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(getBoards).mockResolvedValue([makeSummary()]);
  vi.mocked(getBoard).mockResolvedValue(makeBoard());
  vi.mocked(getDirectory).mockResolvedValue([]);
  vi.mocked(getAllUsers).mockResolvedValue([]);
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
    mockedGetSession.mockResolvedValue(makeUser());

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeInTheDocument();
  });

  it("signs in with valid credentials", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedLogin.mockResolvedValue(makeUser());
    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(mockedLogin).toHaveBeenCalledWith("user", "password");
    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeInTheDocument();
  });

  it("registers a new account", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedRegister.mockResolvedValue(
      makeUser({ id: 2, username: "casey", displayName: "Casey", role: "member" })
    );
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "casey");
    await userEvent.type(screen.getByLabelText(/display name/i), "Casey");
    await userEvent.type(screen.getByLabelText(/password/i), "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(mockedRegister).toHaveBeenCalledWith("casey", "correct-horse", "Casey");
    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeInTheDocument();
  });

  it("reports a taken username during registration", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedRegister.mockRejectedValue(
      new ApiError(409, "That username is already taken")
    );
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "correct-horse");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That username is already taken"
    );
  });

  it("shows an error for invalid credentials", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedLogin.mockRejectedValue(new ApiError(401, "Invalid username or password"));
    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password."
    );
  });

  it("shows the server's detail for a non-credential login failure", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedLogin.mockRejectedValue(
      new ApiError(429, "Too many failed login attempts. Try again shortly.")
    );
    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many failed login attempts. Try again shortly."
    );
  });

  it("shows a network error when the server cannot be reached", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedLogin.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<App />);

    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to reach the server. Please try again."
    );
  });

  it("signs out from the account dialog and returns to sign-in", async () => {
    mockedGetSession.mockResolvedValue(makeUser());
    mockedLogout.mockResolvedValue();
    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: /account and settings/i })
    );
    await userEvent.click(await screen.findByRole("button", { name: /^sign out$/i }));

    expect(mockedLogout).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole("heading", { name: /welcome back/i })
    ).toBeInTheDocument();
  });
});
