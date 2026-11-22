export type Role = 'receptor' | 'donador' | 'admin';
export type AccountStatus = 'activo' | 'suspendido' | 'eliminado';
export type Category = 'frutas' | 'verduras' | 'pan' | 'otros';
export type Unit = 'kg' | 'piezas' | 'porciones' | 'litros' | 'cajas';
export type DonationStatus = 'disponible' | 'reservada' | 'entregada' | 'cancelada' | 'expirada';
export type ReservationStatus = 'confirmada' | 'entregada' | 'cancelada' | 'expirada';

export interface Preferences {
  notifications: boolean;
  pushNotifications: boolean;
  location: boolean;
  camera: boolean;
  darkMode: 'system' | 'light' | 'dark';
  language: 'es' | 'en';
}

export interface User {
  id: string;
  role: Role;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  mustChangePassword: boolean;
  phone?: string;
  businessName?: string;
  organization?: string;
  address?: string;
  lat?: number;
  lng?: number;
  status: AccountStatus;
  failedAttempts: number;
  lockedUntil?: string;
  acceptedTermsVersion?: string;
  acceptedTermsAt?: string;
  prefs: Preferences;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface Donation {
  id: string;
  donorId: string;
  donorDisplayName?: string;
  title: string;
  description?: string;
  category: Category;
  quantity: number;
  unit: Unit;
  photos: string[];
  address: string;
  lat: number;
  lng: number;
  availableUntil: string | null;
  status: DonationStatus;
  reservedBy?: string;
  reservationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Reservation {
  id: string;
  donationId: string;
  receptorId: string;
  donorId: string;
  code: string;
  status: ReservationStatus;
  incorrectAttempts: number;
  confirmedAt: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'reserva_confirmada' | 'nueva_donacion_cerca' | 'entrega_registrada' | 'reserva_cancelada' | 'donacion_expirada' | 'cuenta' | 'sistema' | 'mensaje';
  title: string;
  body: string;
  entityId?: string;
  read: boolean;
  createdAt: string;
}

export interface AccessRequest {
  id: string;
  type: 'alta' | 'reset_password';
  name: string;
  email: string;
  desiredRole?: Role;
  message?: string;
  status: 'pendiente' | 'aprobada' | 'rechazada';
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  fromUserId: string;
  toUserId?: string;
  text: string;
  createdAt: string;
  read: boolean;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  detail?: string;
  createdAt: string;
}

export interface ReportAggregate {
  id: string;
  users: number;
  donations: number;
  reservations: number;
  deliveries: number;
  rescuedKg: number;
  updatedAt: string;
}

export interface Database {
  users: PublicUser[];
  donations: Donation[];
  reservations: Reservation[];
  notifications: AppNotification[];
  messages: ChatMessage[];
  accessRequests: AccessRequest[];
  auditLog: AuditEntry[];
  reports: ReportAggregate[];
}

export type PublicUser = Omit<User, 'passwordHash' | 'salt'>;
export type DemoDatabase = Omit<Database, 'users'> & { users: User[] };
