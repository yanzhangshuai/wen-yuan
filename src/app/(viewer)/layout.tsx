import { headers } from "next/headers";
import { ViewerHeader } from "@/components/layout/viewer-header";
import { AUTH_ADMIN_ROLE, getAuthContext, sanitizeRedirectPath } from "@/server/modules/auth";

export default async function ViewerLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const auth = await getAuthContext(requestHeaders);
  const isAdmin = auth.role === AUTH_ADMIN_ROLE;
  
  const headerPath = requestHeaders.get("x-auth-current-path");
  const currentPath = sanitizeRedirectPath(headerPath);

  return (
    <div className="flex flex-col min-h-screen">
      <ViewerHeader isAdmin={isAdmin} currentPath={currentPath} />
      <main className="mx-auto w-full max-w-[1440px] flex-1 animate-page-enter">
        {children}
      </main>
    </div>
  );
}
