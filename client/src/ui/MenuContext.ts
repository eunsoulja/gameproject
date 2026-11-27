import type { PlayerProfile, PublicPlot } from '../../../shared/types';
import type { NetworkClient } from '../systems/NetworkClient';
import type { Notifications } from './Notifications';

export interface MenuContext {
  getProfile: () => PlayerProfile;
  network: NetworkClient;
  onProfile: (profile: PlayerProfile) => void;
  notify: Notifications;
  getPlots: () => PublicPlot[];
}
