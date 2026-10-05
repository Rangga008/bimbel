// Stub @nestjs/config untuk unit test — @nestjs/config adalah ESM murni dan
// tidak bisa dimuat ts-jest CommonJS. ConfigService.get() mengembalikan
// `defaultValue` supaya perilaku fallback di service tetap teruji.
export class ConfigService {
  private readonly values = new Map<string, unknown>();
  constructor() {}
  get<T = unknown>(key: string, defaultValue?: T): T {
    return (this.values.get(key) ?? defaultValue) as T;
  }
  getOrThrow<T = unknown>(key: string, defaultValue?: T): T {
    const value = this.values.get(key) ?? defaultValue;
    if (value === undefined || value === null) {
      throw new Error(`Missing required config: ${key}`);
    }
    return value as T;
  }
  set(key: string, value: unknown) {
    this.values.set(key, value);
  }
}

export class ConfigModule {
  static forRoot() {
    return { module: ConfigModule };
  }
  static forRootAsync() {
    return { module: ConfigModule };
  }
}
