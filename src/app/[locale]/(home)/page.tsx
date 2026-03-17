
import { Hero } from "@/components/hero";
import { FingerprintStatus } from "@windrun-huaiin/third-ui/fingerprint";
import { FAQ, Features, SeoContent, Tips, Usage } from "@windrun-huaiin/third-ui/main/server";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isDev = process.env.NODE_ENV !== 'production';
  const forceShow = process.env.SHOW_FINGERPRINT_STATUS === 'true'
  return (
    <>
      { (forceShow || isDev) && <FingerprintStatus /> }
      <FingerprintStatus />
      <Hero locale={locale} />
      <Usage locale={locale} />
      <Features locale={locale} />
      <Tips locale={locale} />
      <FAQ locale={locale} />
      <SeoContent locale={locale} />
    </>
  )
}

