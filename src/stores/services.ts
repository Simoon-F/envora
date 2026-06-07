import { create } from 'zustand';
import type { ServiceInfo } from '@/types/service';

interface ServicesStore {
  services: ServiceInfo[];
  setServices: (services: ServiceInfo[]) => void;
  updateService: (id: string, update: Partial<ServiceInfo>) => void;
}

export const useServicesStore = create<ServicesStore>((set) => ({
  services: [],
  setServices: (services) => set({ services }),
  updateService: (id, update) =>
    set((state) => ({
      services: state.services.map((s) =>
        s.id === id ? { ...s, ...update } : s
      ),
    })),
}));
