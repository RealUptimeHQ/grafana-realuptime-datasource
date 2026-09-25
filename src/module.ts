import { DataSourcePlugin } from "@grafana/data";
import { ConfigEditor } from "./components/ConfigEditor.tsx";
import { QueryEditor } from "./components/QueryEditor.tsx";
import { RealUptimeDataSource } from "./datasource.ts";
import type { RealUptimeDataSourceOptions, RealUptimeQuery } from "./types.ts";

export const plugin = new DataSourcePlugin<RealUptimeDataSource, RealUptimeQuery, RealUptimeDataSourceOptions>(
  RealUptimeDataSource,
)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
