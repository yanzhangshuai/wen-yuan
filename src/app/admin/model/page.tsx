import type { Metadata } from "next";

import { listAdminModels } from "@/server/modules/models";
import { ModelManager } from "./_components/model-manager";
import {
  PageContainer,
  PageHeader
} from "@/components/layout/page-header";

/**
 * 文件定位（Next.js App Router 页面文件）：
 * - 文件路径：`src/app/admin/model/page.tsx`
 * - 路由语义：`/admin/model`
 * - 文件类型：`page.tsx`（路由段页面入口）。
 *
 * 在渲染链路中的职责：
 * - 该页面是“模型设置”模块的服务端入口，负责首屏拉取模型清单；
 * - 将初始数据交给客户端管理组件 `ModelManager`，后续交互（新增/编辑/测试/启停）在客户端进行。
 *
 * 为什么这里用 Server Component（未声明 `"use client"`）：
 * - 首屏即可拿到模型列表，避免客户端再发一次请求导致的加载闪烁；
 * - 服务端可直接访问 server modules，减少前后端来回拼装成本；
 * - 页面本身只做“数据装配 + 区域布局”，交互细节下沉到客户端子组件。
 *
 * 上下游关系：
 * - 上游：管理后台布局层完成权限校验；
 * - 下游：`ModelManager` 接收 `initialModels` 作为初始状态基线。
 */
export const metadata: Metadata = { title: "模型设置" };

/**
 * 管理端模型设置页面。
 *
 * 业务目标：
 * - 统一管理可用模型、API Key、默认策略等配置；
 * - 为管理员提供“可回看 + 可调整”的模型治理入口。
 *
 * @returns 模型设置页 JSX
 */
export default async function AdminModelPage() {
  // 服务端首屏查询：
  // 业务意图是让管理员进入页面后立即看到当前模型配置快照，降低误判“无数据”的概率。
  const initialModels = await listAdminModels();
  return (
    <PageContainer>
      <PageHeader
        title="模型设置"
        description="配置 AI 模型、API 密钥与系统偏好"
        /*
         * 面包屑语义：
         * - 第一项回到后台首页，保证管理流可回退；
         * - 第二项为当前页，不提供 href 以避免“自跳转”造成无意义刷新。
         */
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "模型设置" }
        ]}
      />
      {/*
        客户端容器组件：
        - `initialModels` 是服务端注入的初始快照；
        - 组件内部再根据用户操作驱动增删改查与局部刷新。
      */}
      <ModelManager initialModels={initialModels} />
    </PageContainer>
  );
}
