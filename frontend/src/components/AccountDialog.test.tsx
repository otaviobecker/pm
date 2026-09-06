import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountDialog } from "@/components/AccountDialog";
import {
  ApiError,
  administerUser,
  changePassword,
  deleteUser,
  getAllUsers,
  updateProfile,
} from "@/lib/api";
import { makeUser } from "@/test/fixtures";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getAllUsers: vi.fn(),
    administerUser: vi.fn(),
    deleteUser: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  };
});

const casey = makeUser({
  id: 2,
  username: "casey",
  displayName: "Casey",
  role: "member",
});

const renderDialog = (user = makeUser()) => {
  const onClose = vi.fn();
  const onLogout = vi.fn();
  const onUserChange = vi.fn();
  render(
    <AccountDialog
      user={user}
      onUserChange={onUserChange}
      onClose={onClose}
      onLogout={onLogout}
    />
  );
  return { onClose, onLogout, onUserChange };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAllUsers).mockResolvedValue([makeUser(), casey]);
  vi.mocked(administerUser).mockResolvedValue(casey);
  vi.mocked(deleteUser).mockResolvedValue(undefined);
});

describe("AccountDialog", () => {
  it("closes on Escape and from the close button", async () => {
    const { onClose } = renderDialog();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("reports a failed profile save", async () => {
    vi.mocked(updateProfile).mockRejectedValue(new ApiError(422, "Nope"));
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /save profile/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
  });

  it("changes the password and signs out", async () => {
    vi.mocked(changePassword).mockResolvedValue(undefined);
    const { onLogout } = renderDialog();

    await userEvent.type(screen.getByLabelText("Current password"), "old-password");
    await userEvent.type(screen.getByLabelText("New password"), "new-password");
    await userEvent.click(
      screen.getByRole("button", { name: /change password/i })
    );

    expect(changePassword).toHaveBeenCalledWith("old-password", "new-password");
    expect(onLogout).toHaveBeenCalledOnce();
    expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
  });

  it("reports a rejected password change", async () => {
    vi.mocked(changePassword).mockRejectedValue(
      new ApiError(422, "Current password is incorrect")
    );
    const { onLogout } = renderDialog();

    await userEvent.type(screen.getByLabelText("Current password"), "wrong-password");
    await userEvent.type(screen.getByLabelText("New password"), "new-password");
    await userEvent.click(
      screen.getByRole("button", { name: /change password/i })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Current password is incorrect"
    );
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("promotes an account", async () => {
    renderDialog();

    await userEvent.selectOptions(
      await screen.findByLabelText("Role for casey"),
      "admin"
    );

    expect(administerUser).toHaveBeenCalledWith(2, { role: "admin" });
    expect(getAllUsers).toHaveBeenCalledTimes(2);
  });

  it("deactivates an account", async () => {
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: /deactivate casey/i }));

    expect(administerUser).toHaveBeenCalledWith(2, { isActive: false });
  });

  it("reports a refused administrative change", async () => {
    vi.mocked(administerUser).mockRejectedValue(
      new ApiError(422, "The workspace must keep at least one active administrator")
    );
    renderDialog();

    await userEvent.selectOptions(
      await screen.findByLabelText("Role for user"),
      "member"
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "at least one active administrator"
    );
  });

  it("deletes an account", async () => {
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: /delete casey/i }));

    expect(deleteUser).toHaveBeenCalledWith(2);
    expect(await screen.findByText(/deleted casey/i)).toBeInTheDocument();
  });

  it("reports a refused deletion", async () => {
    vi.mocked(deleteUser).mockRejectedValue(new ApiError(422, "Cannot delete"));
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: /delete casey/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot delete");
  });

  it("reports a failure to load the account list", async () => {
    vi.mocked(getAllUsers).mockRejectedValue(new ApiError(500));
    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load the account list."
    );
  });
});
