export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  imageUrl?: string;
  createdAt: number;
}

export interface Order {
  id: string;
  userId?: string; // Optional if guest
  items: OrderItem[];
  totalAmount: number;
  paymentMethod: "cash" | "card";
  status: "pending" | "completed" | "cancelled";
  createdAt: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  loyaltyPoints: number;
  orderHistory: string[]; // Order IDs
  isAdmin: boolean;
}
