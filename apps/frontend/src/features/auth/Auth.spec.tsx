import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Auth } from "./Auth";

// `Auth` uses `Link`/`useNavigate`, so it needs a real (if minimal) router
// around it — a single root route is enough for a component test, same
// idea as routes/dev/-ui.spec.tsx's "render the whole page, don't throw"
// smoke test, just with the router/query providers a real app tree has.
function renderAuth() {
  const rootRoute = createRootRoute({ component: Auth });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/login"] }),
  });
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function renderAndSettle() {
  const view = renderAuth();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe("Auth", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the login form by default with the submit button disabled", async () => {
    await renderAndSettle();

    expect(screen.getByRole("heading", { name: "С возвращением" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeDisabled();
  });

  it("switches to the registration form via the tab and via the inline link", async () => {
    await renderAndSettle();

    fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));
    expect(screen.getByRole("heading", { name: "Новый аккаунт" })).toBeInTheDocument();
    expect(screen.getByText("Латиница, цифры и _")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Вход" }));
    fireEvent.click(screen.getByText("Создать аккаунт"));
    expect(screen.getByRole("heading", { name: "Новый аккаунт" })).toBeInTheDocument();
  });

  it("enables the login submit button once both fields have a value", async () => {
    await renderAndSettle();

    fireEvent.change(screen.getByLabelText("Имя пользователя"), {
      target: { value: "tihiy_veter" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "correcthorse" } });

    expect(screen.getByRole("button", { name: "Войти" })).toBeEnabled();
  });
});
