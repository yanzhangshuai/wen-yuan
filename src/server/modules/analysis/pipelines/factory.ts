import {
  createSequentialPipeline,
  type SequentialPipelineDependencies
} from "@/server/modules/analysis/pipelines/sequential/SequentialPipeline";
import {
  createThreeStagePipeline,
  type ThreeStagePipelineDependencies
} from "@/server/modules/analysis/pipelines/threestage/ThreeStagePipeline";
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
  threestage?: ThreeStagePipelineDependencies;
}

/**
 * 统一的 pipeline 选择入口。
 * 按 `architecture` 字面量路由到对应目录下的实现；新增架构需同时扩展 types 与此 switch。
 */
export function createPipeline(
  architecture: AnalysisArchitecture,
  dependencies: AnalysisPipelineFactoryDependencies = {}
): AnalysisPipeline {
  switch (architecture) {
    case "sequential":
      return createSequentialPipeline(dependencies.sequential);
    case "threestage":
      return createThreeStagePipeline(dependencies.threestage);
    default: {
      const unsupportedArchitecture: never = architecture;
      throw new Error(`不支持的解析架构: ${String(unsupportedArchitecture)}`);
    }
  }
}
