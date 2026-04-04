import Link from "next/link";
import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ViewerNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="mb-6 p-4 rounded-full bg-primary-subtle">
        <Library className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">
        页面未找到
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        您访问的页面不存在，可能已被移除或地址有误。
      </p>
      <Button asChild className="gap-2">
        <Link href="/">
          <Library size={16} />
          返回书库
        </Link>
      </Button>
    </div>
  );
}
