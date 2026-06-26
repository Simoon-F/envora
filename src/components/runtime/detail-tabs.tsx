import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tab.title}</CardTitle>
            </CardHeader>
            <CardContent>{tab.content}</CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
};
