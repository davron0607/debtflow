// IntegrationAdapter — the seam that makes V2 cheap.
// V1 ships mock adapters only. V2 will implement the same interface
// for E-SUD, Нотариус, MIB/БПИ, Кадастр, ABS, E-IMZO.

export type SubmissionRef = { adapter: string; externalId: string; submittedAt: string };
export type ExternalStatus = { state: string; note?: string; at: string };
export type AssetReport = {
  pinfl: string;
  properties: { kind: string; value: number; note?: string }[];
  accounts: { bank: string; currency: string; balance: number }[];
};

export interface IntegrationAdapter {
  readonly name: string;
  submitCase(caseId: string): Promise<SubmissionRef>;
  fetchStatus(ref: SubmissionRef): Promise<ExternalStatus>;
  requestAssetReport(debtorPinfl: string): Promise<AssetReport>;
}

class MockAdapter implements IntegrationAdapter {
  constructor(public readonly name: string) {}
  async submitCase(caseId: string): Promise<SubmissionRef> {
    return {
      adapter: this.name,
      externalId: `${this.name.toUpperCase()}-${caseId.slice(0, 6)}`,
      submittedAt: new Date().toISOString(),
    };
  }
  async fetchStatus(): Promise<ExternalStatus> {
    return { state: "MOCK_PENDING", note: "V2: подключение недоступно", at: new Date().toISOString() };
  }
  async requestAssetReport(pinfl: string): Promise<AssetReport> {
    return { pinfl, properties: [], accounts: [] };
  }
}

export const adapters = {
  esud: new MockAdapter("esud"),
  notary: new MockAdapter("notary"),
  mib: new MockAdapter("mib"),
  cadastre: new MockAdapter("cadastre"),
  abs: new MockAdapter("abs"),
  eimzo: new MockAdapter("eimzo"),
  tpp: new MockAdapter("tpp"),
  gai: new MockAdapter("gai"),
} as const;

export const integrationsCatalog: { key: keyof typeof adapters; label: string; desc: string }[] = [
  { key: "esud", label: "E-SUD", desc: "Электронная подача исков (V2)" },
  { key: "notary", label: "Нотариус", desc: "Исполнительная надпись (V2)" },
  { key: "mib", label: "МИБ / БПИ", desc: "Бюро принудительного исполнения (V2)" },
  { key: "cadastre", label: "Кадастр / гос-БД", desc: "Проверка имущества (V2)" },
  { key: "abs", label: "ABS", desc: "Ядро банка (V2)" },
  { key: "eimzo", label: "E-IMZO", desc: "ЭЦП физлица (V2)" },
  { key: "tpp", label: "ТПП", desc: "Третейское разбирательство через ТПП (V2)" },
  { key: "gai", label: "Штрафы ГАИ", desc: "Штрафы и автомобили должника (V2)" },
];
