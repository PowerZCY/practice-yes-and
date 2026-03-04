import { baseOptions, homeNavLinks, levelNavLinks } from '@/app/[locale]/layout.config';
import { showBanner } from '@/lib/appConfig';
import { fingerprintConfig } from '@windrun-huaiin/backend-core/lib';
import { FingerprintProvider } from '@windrun-huaiin/third-ui/fingerprint';
import { CustomHomeLayout } from '@windrun-huaiin/third-ui/fuma/base';
import { type HomeLayoutProps } from 'fumadocs-ui/layouts/home';
import type { ReactNode } from 'react';

async function homeOptions(locale: string): Promise<HomeLayoutProps> {
  return {
    ...(await baseOptions(locale)),
    links: [
      ...(await levelNavLinks(locale)),
      ...(await homeNavLinks(locale)),
    ]
  };
}

export default async function Layout({
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
        showBanner={showBanner}
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

