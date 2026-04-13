import { createCommonAppConfig, createI18nHelpers, LOCALE_PRESETS } from "@windrun-huaiin/lib/common-app-config";

// create app config
export const appConfig = {
  ...createCommonAppConfig(LOCALE_PRESETS.EN_ONLY),
  openrouterAI: {
    appName: process.env.NEXT_PUBLIC_APP_NAME || 'Practice Yes And',
    timeoutSeconds: Number(process.env.OPENROUTER_TIMEOUT_SECONDS) || 240,
    apiKey: process.env.OPENROUTER_API_KEY || '',
    modelName: process.env.NEXT_PUBLIC_OPENROUTER_MODEL_NAME || 'google/gemini-2.0-flash-001',
    // 默认启用mock，防止DEV飞速消耗token数量
    enableMock: process.env.OPENROUTER_ENABLE_MOCK !== 'false',
    mockType: Number(process.env.OPENROUTER_MOCK_TYPE) || 0,
    mockTimeoutSeconds: Number(process.env.OPENROUTER_MOCK_TIMEOUT_SECONDS) || 3,
    mockStreamChunkDelayMs: Number(process.env.OPENROUTER_MOCK_STREAM_CHUNK_DELAY_MS) || 60,
    // mock stream chunks are grouped by word count, not byte count
    mockStreamChunkSize: Number(process.env.OPENROUTER_MOCK_STREAM_CHUNK_SIZE) || 8,
    contextWindowTurns: Number(process.env.NEXT_PUBLIC_CHAT_CONTEXT_WINDOW_TURNS) || 6,
    debug: process.env.NEXT_PUBLIC_OPENROUTER_DEBUG === 'true',
    // 单词请求限制消耗的token数量
    limitMaxWords: 500
  },
  creditsConfig: {
    freeAmount: 1,
    freeRegisterAmount: 2,
    freeExpiredDays: 7,
    oneTimeExpiredDays: 30
  }
};

// export i18n helpers
export const { isSupportedLocale, getValidLocale, generatedLocales } = createI18nHelpers(appConfig.i18n);

export const { localePrefixAsNeeded, defaultLocale } = appConfig.i18n;

// export shortcuts
export const { iconColor, watermark, showBanner, clerkPageBanner, clerkAuthInModal, placeHolderImage } = appConfig.shortcuts;

export const { freeAmount, freeRegisterAmount, freeExpiredDays, oneTimeExpiredDays } = appConfig.creditsConfig;
