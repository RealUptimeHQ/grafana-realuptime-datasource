import type { QueryEditorProps, SelectableValue } from "@grafana/data";
import { AsyncMultiSelect, InlineField, Select, Stack } from "@grafana/ui";
import { useCallback } from "react";
import type { RealUptimeDataSource } from "../datasource.ts";
import { LIVE_REGIONS, LIVE_REGION_LABELS } from "../regions.ts";
import { type Metric, METRIC_LABELS, METRICS, type RealUptimeDataSourceOptions, type RealUptimeQuery } from "../types.ts";

type Props = QueryEditorProps<RealUptimeDataSource, RealUptimeQuery, RealUptimeDataSourceOptions>;

const METRIC_OPTIONS: Array<SelectableValue<Metric>> = METRICS.map((metric) => ({
  label: METRIC_LABELS[metric],
  value: metric,
}));

/** `region` is a single optional filter, not a list -- `GET /checks/results`
 * (docs/api.md) takes at most one `region`, omitted meaning every region, so
 * this is a `Select`, not a `MultiSelect`, deliberately narrower than the
 * checks picker below it. */
const REGION_OPTIONS: Array<SelectableValue<string>> = [
  { label: "All regions", value: "" },
  ...LIVE_REGIONS.map((region) => ({ label: `${LIVE_REGION_LABELS[region]} (${region})`, value: region })),
];

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const loadCheckOptions = useCallback(async (): Promise<Array<SelectableValue<string>>> => {
    const checks = await datasource.getChecks();
    return checks.map((check) => ({ label: check.name, value: check.id }));
  }, [datasource]);

  const onChecksChange = (selected: Array<SelectableValue<string>>) => {
    onChange({ ...query, checkIds: selected.map((option) => option.value).filter((id): id is string => Boolean(id)) });
    onRunQuery();
  };

  const onRegionChange = (selected: SelectableValue<string> | null) => {
    onChange({ ...query, region: selected?.value || undefined });
    onRunQuery();
  };

  const onMetricChange = (selected: SelectableValue<Metric> | null) => {
    onChange({ ...query, metric: selected?.value ?? "uptime" });
    onRunQuery();
  };

  return (
    <Stack gap={1} wrap>
      <InlineField label="Checks" labelWidth={14} tooltip="Omit to query every check the account owns.">
        <AsyncMultiSelect
          inputId="realuptime-query-editor-checks"
          loadOptions={loadCheckOptions}
          defaultOptions
          value={(query.checkIds ?? []).map((id) => ({ label: id, value: id }))}
          onChange={onChecksChange}
          placeholder="All checks"
          width={32}
        />
      </InlineField>
      <InlineField label="Region" labelWidth={12} tooltip="One region, or every region.">
        <Select
          inputId="realuptime-query-editor-region"
          options={REGION_OPTIONS}
          value={REGION_OPTIONS.find((option) => option.value === (query.region ?? ""))}
          onChange={onRegionChange}
          width={24}
        />
      </InlineField>
      <InlineField label="Metric" labelWidth={12}>
        <Select
          inputId="realuptime-query-editor-metric"
          options={METRIC_OPTIONS}
          value={METRIC_OPTIONS.find((option) => option.value === (query.metric ?? "uptime"))}
          onChange={onMetricChange}
          width={20}
        />
      </InlineField>
    </Stack>
  );
}
