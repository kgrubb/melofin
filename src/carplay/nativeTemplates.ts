import { ListTemplate, TabBarTemplate } from 'react-native-carplay'
import type { CarPlayListSection } from '@/src/carplay/templates'

export const createBrowseTemplate = (sections: readonly CarPlayListSection[]) =>
  new TabBarTemplate({
    templates: sections.map(
      (section) =>
        new ListTemplate({
          title: section.title,
          sections: [
            {
              items: section.items.map((item) => ({
                text: item.text,
                detailText: item.detailText,
              })),
            },
          ],
        }),
    ),
    onTemplateSelect: () => undefined,
  })
