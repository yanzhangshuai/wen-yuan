import type { PrismaClient } from "@/generated/prisma/client";
import { AppStatus, MemberRole, WorkVersionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

interface PaginationInput {
  page: number;
  pageSize: number;
}

export interface CreateProjectInput {
  tenantId?: string;
  code: string;
  name: string;
  description?: string;
  creatorUserId: string;
}

export interface CreateWorkInput {
  projectId: string;
  title: string;
  author?: string;
  dynasty?: string;
  genre?: string;
}

export interface CreateWorkVersionInput {
  workId: string;
  versionLabel: string;
  sourceUri: string;
  sourceChecksum: string;
  legacyBookId?: string;
}

/**
 * 功能：项目域服务，封装 Project/Work/WorkVersion 的 CRUD 行为。
 * 输入：构造参数 prismaClient。
 * 输出：ProjectDomainService 实例。
 * 异常：数据库异常向上抛出。
 * 副作用：写入 tenant/project/work/work_versions/project_members 表。
 */
export class ProjectDomainService {
  constructor(private readonly prismaClient: PrismaClient = prisma) {}

  /**
   * 功能：分页获取项目列表。
   * 输入：tenantId 与分页参数。
   * 输出：项目列表与总数。
   * 异常：数据库异常时抛错。
   * 副作用：无。
   */
  async listProjects(tenantId: string | undefined, pagination: PaginationInput) {
    const where = tenantId
      ? {
          tenantId
        }
      : undefined;

    const [items, total] = await this.prismaClient.$transaction([
      this.prismaClient.project.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize
      }),
      this.prismaClient.project.count({ where })
    ]);

    return { items, total };
  }

  /**
   * 功能：创建项目并为创建者注入 OWNER 角色。
   * 输入：CreateProjectInput。
   * 输出：新建项目记录。
   * 异常：唯一键冲突与数据库异常时抛错。
   * 副作用：可能创建默认租户，写入 project_members。
   */
  async createProject(input: CreateProjectInput) {
    const tenant = input.tenantId
      ? await this.prismaClient.tenant.findUnique({ where: { id: input.tenantId } })
      : await this.ensureDefaultTenant();

    if (!tenant) {
      throw new Error("tenant_not_found");
    }

    const project = await this.prismaClient.project.create({
      data: {
        tenantId: tenant.id,
        code: input.code,
        name: input.name,
        description: input.description,
        status: AppStatus.ACTIVE,
        members: {
          create: {
            user: {
              connectOrCreate: {
                where: {
                  id: input.creatorUserId
                },
                create: {
                  id: input.creatorUserId,
                  email: `${input.creatorUserId}@local.dev`,
                  name: input.creatorUserId,
                  status: AppStatus.ACTIVE
                }
              }
            },
            role: MemberRole.OWNER
          }
        }
      }
    });

    return project;
  }

  /**
   * 功能：按 ID 获取单个项目详情。
   * 输入：projectId。
   * 输出：项目详情（含租户信息）。
   * 异常：数据库异常时抛错。
   * 副作用：无。
   */
  async getProjectById(projectId: string) {
    return this.prismaClient.project.findUnique({
      where: { id: projectId },
      include: {
        tenant: true
      }
    });
  }

  /**
   * 功能：分页获取项目下作品列表。
   * 输入：projectId 与分页参数。
   * 输出：作品列表与总数。
   * 异常：数据库异常时抛错。
   * 副作用：无。
   */
  async listWorks(projectId: string, pagination: PaginationInput) {
    const where = { projectId };

    const [items, total] = await this.prismaClient.$transaction([
      this.prismaClient.work.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize
      }),
      this.prismaClient.work.count({ where })
    ]);

    return { items, total };
  }

  /**
   * 功能：创建作品。
   * 输入：CreateWorkInput。
   * 输出：作品记录。
   * 异常：唯一键冲突与数据库异常时抛错。
   * 副作用：写入 works。
   */
  async createWork(input: CreateWorkInput) {
    return this.prismaClient.work.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        author: input.author,
        dynasty: input.dynasty,
        genre: input.genre,
        status: AppStatus.ACTIVE
      }
    });
  }

  /**
   * 功能：按 ID 获取作品详情。
   * 输入：workId。
   * 输出：作品记录（含项目信息）。
   * 异常：数据库异常时抛错。
   * 副作用：无。
   */
  async getWorkById(workId: string) {
    return this.prismaClient.work.findUnique({
      where: { id: workId },
      include: {
        project: true
      }
    });
  }

  /**
   * 功能：分页获取作品版本列表。
   * 输入：workId 与分页参数。
   * 输出：版本列表与总数。
   * 异常：数据库异常时抛错。
   * 副作用：无。
   */
  async listWorkVersions(workId: string, pagination: PaginationInput) {
    const where = { workId };

    const [items, total] = await this.prismaClient.$transaction([
      this.prismaClient.workVersion.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize
      }),
      this.prismaClient.workVersion.count({ where })
    ]);

    return { items, total };
  }

  /**
   * 功能：创建作品版本。
   * 输入：CreateWorkVersionInput。
   * 输出：版本记录。
   * 异常：唯一键冲突与数据库异常时抛错。
   * 副作用：写入 work_versions。
   */
  async createWorkVersion(input: CreateWorkVersionInput) {
    return this.prismaClient.workVersion.create({
      data: {
        workId: input.workId,
        versionLabel: input.versionLabel,
        sourceUri: input.sourceUri,
        sourceChecksum: input.sourceChecksum,
        legacyBookId: input.legacyBookId,
        status: WorkVersionStatus.DRAFT
      }
    });
  }

  private async ensureDefaultTenant() {
    return this.prismaClient.tenant.upsert({
      where: { code: "default" },
      update: {
        name: "Default Tenant",
        status: AppStatus.ACTIVE
      },
      create: {
        code: "default",
        name: "Default Tenant",
        status: AppStatus.ACTIVE
      }
    });
  }
}

export const projectDomainService = new ProjectDomainService();
