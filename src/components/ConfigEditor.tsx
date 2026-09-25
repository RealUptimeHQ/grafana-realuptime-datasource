import type { DataSourcePluginOptionsEditorProps } from "@grafana/data";
import { Field, Input, SecretInput } from "@grafana/ui";
import type { ChangeEvent } from "react";
import { resetApiKey, setApiKey, setBaseUrl } from "../config-editor-logic.ts";
import type { RealUptimeDataSourceOptions, RealUptimeSecureJsonData } from "../types.ts";

type Props = DataSourcePluginOptionsEditorProps<RealUptimeDataSourceOptions, RealUptimeSecureJsonData>;

/**
 * Base URL plus API key (REA-566). The key field is `SecretInput`, wired to
 * `secureJsonData`/`secureJsonFields` via `../config-editor-logic.ts`'s pure
 * functions -- see that file's module comment for exactly what guarantee
 * this buys and why it matters. This component only ever calls those
 * functions; it never spells `secureJsonData` itself outside of reading
 * `options.secureJsonData`/`secureJsonFields` back for display.
 */
export function ConfigEditor(props: Props) {
  const { onOptionsChange, options } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;

  const onBaseUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange(setBaseUrl(options, event.target.value));
  };

  const onApiKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange(setApiKey(options, event.target.value));
  };

  const onResetApiKey = () => {
    onOptionsChange(resetApiKey(options));
  };

  return (
    <>
      <Field label="Base URL" description="Your RealUptime API base, e.g. https://api.realuptime.io">
        <Input
          id="realuptime-config-editor-base-url"
          onChange={onBaseUrlChange}
          value={jsonData.baseUrl ?? ""}
          placeholder="https://api.realuptime.io"
          width={40}
        />
      </Field>
      <Field label="API key" description="A read-scoped RealUptime API key. Stored as a secure field: never exported with a dashboard.">
        <SecretInput
          required
          id="realuptime-config-editor-api-key"
          isConfigured={Boolean(secureJsonFields?.apiKey)}
          value={secureJsonData?.apiKey ?? ""}
          placeholder="ru_live_..."
          width={40}
          onReset={onResetApiKey}
          onChange={onApiKeyChange}
        />
      </Field>
    </>
  );
}
