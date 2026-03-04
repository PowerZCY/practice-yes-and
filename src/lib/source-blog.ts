import { blog } from '@/.source';
import { getIconElement } from '@windrun-huaiin/base-ui/components/server';
import { i18n } from '@/i18n';
import { loader } from 'fumadocs-core/source';

export const blogSource = loader({
  i18n,
  baseUrl: '/blog',
  source: blog.toFumadocsSource(),
  icon: getIconElement,
});