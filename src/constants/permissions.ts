export interface RolePermission {
  id: string;
  role: string;
  permissions: string[];
}

export const DEFAULT_ROLE_PERMISSIONS: RolePermission[] = [
  {
    id: 'admin',
    role: 'admin',
    permissions: ['dashboard', 'tracking', 'custom_map', 'rfid_gateway', 'ai_insights', 'api_docs', 'settings', 'audit']
  },
  {
    id: 'manager',
    role: 'manager',
    permissions: ['dashboard', 'tracking', 'custom_map', 'rfid_gateway', 'ai_insights', 'api_docs']
  },
  {
    id: 'viewer',
    role: 'viewer',
    permissions: ['dashboard', 'tracking', 'custom_map']
  }
];

export const DEFAULT_PERMISSIONS_MAP: Record<string, string[]> = {
  admin: ['dashboard', 'tracking', 'custom_map', 'rfid_gateway', 'ai_insights', 'api_docs', 'settings', 'audit'],
  manager: ['dashboard', 'tracking', 'custom_map', 'rfid_gateway', 'ai_insights', 'api_docs'],
  viewer: ['dashboard', 'tracking', 'custom_map']
};
