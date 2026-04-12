import { getTranslations } from 'next-intl/server'
import { HeroClient } from './hero-client'
import { listChatSessionsForCurrentUser } from '@/aggregate/chatSession.aggregate.service'
import { getOptionalServerAuthUser } from '@windrun-huaiin/backend-core/auth/server';

export async function Hero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'hero' });
  const authUser = await getOptionalServerAuthUser();
  const initialIsSignedIn = Boolean(authUser?.user?.clerkUserId);
  const initialSessions = initialIsSignedIn
    ? await listChatSessionsForCurrentUser()
    : [];

  return (
    <section className="relative w-full overflow-hidden mt-8 pt-12 pb-8 md:pt-16 md:pb-12">
      {/* Background warm ambient light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-linear-to-b from-rose-400/20 via-orange-300/10 to-transparent blur-[120px] pointer-events-none -z-10 animate-pulse duration-3000" />
      
      <div className="mx-auto flex w-full max-w-6xl min-w-[calc(100vw-22rem)] flex-col items-center px-4 sm:px-6 md:px-8 lg:px-10">
        {/* Centered Title Area */}
        <div className="z-10 mx-auto mb-6 max-w-4xl space-y-3 text-center">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-gray-50">
            {t('mainTitle')}{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-rose-500 to-orange-400">
              {t('mainEyesOn')}
            </span>
          </h1>
          <p className="text-base md:text-lg text-gray-500 dark:text-gray-400 font-medium">
            {t('description')}
          </p>
        </div>

        {/* Centered Chat Component */}
        <div className="relative z-10 w-full">
          <HeroClient
            initialSessions={initialSessions}
            initialIsSignedIn={initialIsSignedIn}
          />
        </div>
      </div>
    </section>
  )
}
