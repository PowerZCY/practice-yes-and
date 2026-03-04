import { appConfig, generatedLocales } from "@/lib/appConfig";
import { montserrat } from '@/lib/fonts';
import { GoogleAnalyticsScript, MicrosoftClarityScript } from "@windrun-huaiin/base-ui/components/server";
import { cn } from '@windrun-huaiin/lib/utils';
import { getFumaTranslations } from '@windrun-huaiin/third-ui/fuma/server';
import { NProgressBar } from '@windrun-huaiin/third-ui/main';
import { RootProvider } from "fumadocs-ui/provider/next";
import { ClerkProviderClient } from '@windrun-huaiin/third-ui/clerk';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { getAsNeededLocalizedUrl } from '@windrun-huaiin/lib';
import React from 'react';
import './globals.css';

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params: paramsPromise
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await paramsPromise;
  const t = await getTranslations({ locale, namespace: 'home' });

  return {
    title: t('webTitle'),
    description: t('webDescription'),
    keywords: t('keywords'),
    alternates: {
      canonical: `${appConfig.baseUrl}${getAsNeededLocalizedUrl(locale, '/')}`,
      languages: {
        "en": `${appConfig.baseUrl}${getAsNeededLocalizedUrl('en', '/')}`,
        "zh": `${appConfig.baseUrl}${getAsNeededLocalizedUrl('zh', '/')}`,
      }
    },
    icons: [
      { rel: "icon", type: 'image/png', sizes: "16x16", url: "/favicon-16x16.png" },
      { rel: "icon", type: 'image/png', sizes: "32x32", url: "/favicon-32x32.png" },
      { rel: "icon", type: 'image/ico', url: "/favicon.ico" },
      { rel: "apple-touch-icon", sizes: "180x180", url: "/favicon-180x180.png" },
      { rel: "android-chrome", sizes: "512x512", url: "/favicon-512x512.png" },
    ]
  }
}

export default async function RootLayout({
  children,
  params: paramsPromise
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await paramsPromise;
  setRequestLocale(locale);
  const messages = await getMessages();
  const fumaTranslations = await getFumaTranslations(locale);
  return (
    <html lang={locale} suppressHydrationWarning>
      <NextIntlClientProvider messages={messages}>
        <body className={cn(montserrat.className)}>
          <NProgressBar />
          <ClerkProviderClient locale={locale}>
            <RootProvider
              i18n={{
                locale: locale,
                locales: generatedLocales,
                translations: fumaTranslations,
              }}
            >
              {children}
            </RootProvider>
          </ClerkProviderClient>
        </body>
        <GoogleAnalyticsScript />
        <MicrosoftClarityScript />
      </NextIntlClientProvider>
    </html>
  )
}
