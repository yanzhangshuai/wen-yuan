import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:5432/testdb";

afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
  }
});
