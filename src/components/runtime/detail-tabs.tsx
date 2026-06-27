import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface DetailTab {
  value: string;
  label: string;
  title: string;
  content: ReactNode;
  disabled?: boolean;
}

interface DetailTabsProps {
  tabs: DetailTab[];
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * Shared Tabs + Card shell used by every runtime detail page.
 * Replaces the repeated Tabs → TabsContent → Card → CardHeader pattern.
 */
export const DetailTabs = ({ tabs, value, onValueChange }: DetailTabsProps) => {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList className="mb-4">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0 space-y-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
};
