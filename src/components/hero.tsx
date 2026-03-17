import { getTranslations } from 'next-intl/server'
import { HeroClient } from './hero-client'

export async function Hero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'hero' });

  return (
    <section className="relative w-full overflow-hidden py-8 md:py-12">
      {/* Background warm ambient light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-linear-to-b from-rose-400/20 via-orange-300/10 to-transparent blur-[120px] pointer-events-none -z-10 animate-pulse duration-3000" />
      
      <div className="mx-auto max-w-5xl px-4 flex flex-col items-center">
        {/* Centered Title Area */}
        <div className="text-center mb-6 space-y-3 max-w-2xl mx-auto z-10">
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
        <div className="w-full max-w-4xl relative z-10">
          <HeroClient />
        </div>
      </div>
    </section>
  )
}
