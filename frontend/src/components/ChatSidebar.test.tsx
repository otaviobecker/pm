import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ApiError, sendChat } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    sendChat: vi.fn(),
  };
});

const mockedSendChat = vi.mocked(sendChat);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChatSidebar", () => {
  it("opens and closes", async () => {
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(
      screen.getByRole("heading", { name: "Plan with AI" })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Close AI assistant" })
    );
    expect(screen.getByRole("button", { name: "Ask AI" })).toBeInTheDocument();
  });

  it("keeps conversation history for subsequent messages", async () => {
    mockedSendChat
      .mockResolvedValueOnce({ message: "First answer", board: null })
      .mockResolvedValueOnce({ message: "Second answer", board: null });
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    const input = screen.getByLabelText("Message the board assistant");
    await userEvent.type(input, "First question");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("First answer")).toBeInTheDocument();

    await userEvent.type(input, "Second question");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Second answer")).toBeInTheDocument();
    expect(mockedSendChat).toHaveBeenLastCalledWith("Second question", [
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
    ]);
  });

  it("applies a board returned by the assistant", async () => {
    const onBoardUpdate = vi.fn();
    mockedSendChat.mockResolvedValue({
      message: "Board updated",
      board: initialData,
    });
    render(<ChatSidebar onBoardUpdate={onBoardUpdate} />);
    await userEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    await userEvent.type(
      screen.getByLabelText("Message the board assistant"),
      "Update the board"
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Board updated")).toBeInTheDocument();
    expect(onBoardUpdate).toHaveBeenCalledWith(initialData);
  });

  it("shows a recoverable request error", async () => {
    mockedSendChat.mockRejectedValue(new Error("Request failed"));
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    await userEvent.type(
      screen.getByLabelText("Message the board assistant"),
      "Help"
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The assistant could not respond. Please try again."
    );
  });

  it("shows the server's detail when the assistant request is rejected", async () => {
    mockedSendChat.mockRejectedValue(
      new ApiError(503, "OPENROUTER_API_KEY is not configured")
    );
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    await userEvent.type(
      screen.getByLabelText("Message the board assistant"),
      "Help"
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "OPENROUTER_API_KEY is not configured"
    );
  });

  it(
    "caps the history sent to the server at the most recent messages",
    async () => {
      mockedSendChat.mockResolvedValue({ message: "ok", board: null });
      render(<ChatSidebar onBoardUpdate={vi.fn()} />);
      await userEvent.click(screen.getByRole("button", { name: "Ask AI" }));
      const input = screen.getByLabelText("Message the board assistant");

      for (let index = 0; index < 22; index += 1) {
        await userEvent.clear(input);
        await userEvent.type(input, `message ${index}`);
        await userEvent.click(screen.getByRole("button", { name: "Send" }));
        await screen.findAllByText("ok");
      }

      const lastCall = mockedSendChat.mock.calls.at(-1);
      expect(lastCall?.[1]).toHaveLength(40);
    },
    15000
  );
});
