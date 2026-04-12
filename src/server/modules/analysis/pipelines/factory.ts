import {
  createSequentialPipeline,
  type SequentialPipelineDependencies
} from "@/server/modules/analysis/pipelines/sequential/SequentialPipeline";
import {
  createTwoPassPipeline,
  type TwoPassPipelineDependencies
} from "@/server/modules/analysis/pipelines/twopass/TwoPassPipeline";
import type {
  AnalysisArchitecture,
  AnalysisPipeline
} from "@/server/modules/analysis/pipelines/types";

/**
 * 管线工厂的依赖汇总。
 * 工厂本身不解析这些依赖的业务语义，只负责把不同架构路由到各自目录下的实现。
 */
export interface AnalysisPipelineFactoryDependencies {
  sequential?: SequentialPipelineDependencies;
  twopass?   : TwoPassPipelineDependencies;
}

/**
 * 统一的 pipeline 选择入口。
 * Phase 1 先把“如何按架构拿到实例”固定下来，后续 runAnalysisJob 只需要替换调用点即可完成编排层迁移。
 */
export function createPipeline(
  architecture: AnalysisArchitecture,
  dependencies: AnalysisPipelineFactoryDependencies = {}
): AnalysisPipeline {
  switch (architecture) {
    case "sequential":
      return createSequentialPipeline(dependencies.sequential);
    case "twopass":
      return createTwoPassPipeline(dependencies.twopass);
    default: {
      const unsupportedArchitecture: never = architecture;
      throw new Error(`不支持的解析架构: ${String(unsupportedArchitecture)}`);
    }
  }
}
