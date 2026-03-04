/**
 * @license
 * MIT License
 * Copyright (c) 2025 D8ger
 * 
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { baseOptions } from '@/app/[locale]/layout.config';
import { clerkPageBanner } from '@/lib/appConfig';
import { fingerprintConfig } from '@windrun-huaiin/backend-core/lib';
import { CustomHomeLayout } from '@windrun-huaiin/third-ui/fuma/base';
import { FingerprintProvider } from '@windrun-huaiin/third-ui/fingerprint';
import { type HomeLayoutProps } from 'fumadocs-ui/layouts/home';
import { ReactNode } from 'react';

async function homeOptions(locale: string): Promise<HomeLayoutProps>{
  const resolvedBaseOptions = await baseOptions(locale);
  return {
    ...resolvedBaseOptions,
  };
}

export default async function RootLayout({
  params,
  children,
}: {
  params: Promise<{ locale: string }>;
  children: ReactNode;
}) {
  const { locale } = await params;
  const customeOptions = await homeOptions(locale);
  const homeLayoutOptions: HomeLayoutProps = {
    ...customeOptions,
    searchToggle: {
      enabled: false,
    },
    themeSwitch: {
      enabled: true,
      mode: 'light-dark-system',
    },
  };
  return (
    <FingerprintProvider config={fingerprintConfig}>
      <CustomHomeLayout
          locale={locale}
          options={homeLayoutOptions}
          showBanner={clerkPageBanner}
          showFooter={false}
          showGoToTop={false}
          floatingNav={true}
          actionOrders={{
            desktop: ['search', 'theme', 'github', 'i18n', 'secondary'],
            mobileBar: ['search', 'pinned', 'menu'],
            mobileMenu: ['theme', 'i18n', 'separator', 'secondary', 'github'],
          }}
        >
          {children}
        </CustomHomeLayout>
    </FingerprintProvider>
  );
}
