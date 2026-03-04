import { getMDXComponents } from '@/components/mdx-components';
import { appConfig } from '@/lib/appConfig';
import { NotFoundPage } from '@windrun-huaiin/base-ui/components';
import { blogSource } from '@/lib/source-blog';
import { createFumaPage } from '@windrun-huaiin/third-ui/fuma/server';
import { SiteIcon } from '@/lib/site-config';
import { LLMCopyButton } from '@windrun-huaiin/third-ui/fuma/mdx';

const sourceKey = 'blog';
const { Page, generateStaticParams, generateMetadata } = createFumaPage({
  sourceKey: sourceKey,
  mdxContentSource: blogSource,
  getMDXComponents,
  mdxSourceDir: appConfig.mdxSourceDir[sourceKey],
  githubBaseUrl: appConfig.githubBaseUrl,
  copyButtonComponent: <LLMCopyButton />,
  siteIcon: <SiteIcon />,
  FallbackPage: NotFoundPage,
  supportedLocales: appConfig.i18n.locales as string[],
  showBreadcrumb: false,
  showTableOfContent: true,
  showTableOfContentPopover: false
});

export default Page;
export { generateStaticParams, generateMetadata };