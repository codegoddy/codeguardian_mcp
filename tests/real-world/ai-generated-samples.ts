/**
 * Real-world AI-generated code samples with common hallucinations
 * These are patterns that AI assistants commonly generate
 */

// Sample 1: Authentication Service (Common hallucinations)
export const authServiceHallucination = `
class AuthenticationService {
  constructor(private db: Database) {}

  async login(username: string, password: string): Promise<User> {
    // HALLUCINATION: validateCredentials doesn't exist
    const isValid = await this.validateCredentials(username, password);
    
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // HALLUCINATION: getUserByUsername doesn't exist
    const user = await this.getUserByUsername(username);
    
    // HALLUCINATION: generateAuthToken doesn't exist
    const token = this.generateAuthToken(user);
    
    // HALLUCINATION: updateLastLogin doesn't exist
    await this.updateLastLogin(user.id);
    
    return user;
  }

  async register(email: string, password: string): Promise<User> {
    // HALLUCINATION: hashPassword doesn't exist
    const hashedPassword = await this.hashPassword(password);
    
    // HALLUCINATION: createUser doesn't exist
    const user = await this.createUser(email, hashedPassword);
    
    // HALLUCINATION: sendWelcomeEmail doesn't exist
    await this.sendWelcomeEmail(user.email);
    
    return user;
  }
}
`;

// Sample 2: E-commerce Cart (Method chain hallucinations)
export const ecommerceHallucination = `
class ShoppingCart {
  private items: CartItem[] = [];

  addItem(product: Product, quantity: number) {
    // HALLUCINATION: validateStock doesn't exist
    if (!this.validateStock(product.id, quantity)) {
      throw new Error('Insufficient stock');
    }

    // HALLUCINATION: calculateDiscount doesn't exist
    const discount = this.calculateDiscount(product);
    
    // HALLUCINATION: applyPromotions doesn't exist
    const finalPrice = this.applyPromotions(product.price, discount);
    
    this.items.push({
      product,
      quantity,
      price: finalPrice
    });
  }

  checkout() {
    // HALLUCINATION: validatePaymentMethod doesn't exist
    this.validatePaymentMethod();
    
    // HALLUCINATION: processPayment doesn't exist
    const payment = this.processPayment(this.getTotal());
    
    // HALLUCINATION: createOrder doesn't exist
    const order = this.createOrder(this.items, payment);
    
    // HALLUCINATION: sendOrderConfirmation doesn't exist
    this.sendOrderConfirmation(order);
    
    return order;
  }

  getTotal(): number {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }
}
`;

// Sample 3: API Client (Common SDK-style hallucinations)
export const apiClientHallucination = `
class ApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  async fetchUsers(): Promise<User[]> {
    // HALLUCINATION: buildHeaders doesn't exist
    const headers = this.buildHeaders();
    
    // HALLUCINATION: makeRequest doesn't exist
    const response = await this.makeRequest('/users', { headers });
    
    // HALLUCINATION: validateResponse doesn't exist
    this.validateResponse(response);
    
    // HALLUCINATION: transformData doesn't exist
    return this.transformData(response.data);
  }

  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    // HALLUCINATION: sanitizeInput doesn't exist
    const sanitized = this.sanitizeInput(data);
    
    // HALLUCINATION: makeRequest doesn't exist
    const response = await this.makeRequest(\`/users/\${userId}\`, {
      method: 'PUT',
      body: sanitized
    });
    
    // HALLUCINATION: handleError doesn't exist
    if (response.error) {
      this.handleError(response.error);
    }
    
    return response.data;
  }
}
`;

// Sample 4: Data Processing Pipeline (Chained hallucinations)
export const dataPipelineHallucination = `
class DataProcessor {
  async processData(rawData: any[]): Promise<ProcessedData[]> {
    // HALLUCINATION: cleanData doesn't exist
    const cleaned = await this.cleanData(rawData);
    
    // HALLUCINATION: validateSchema doesn't exist
    const validated = this.validateSchema(cleaned);
    
    // HALLUCINATION: enrichData doesn't exist
    const enriched = await this.enrichData(validated);
    
    // HALLUCINATION: transformFormat doesn't exist
    const transformed = this.transformFormat(enriched);
    
    // HALLUCINATION: saveToDatabase doesn't exist
    await this.saveToDatabase(transformed);
    
    // HALLUCINATION: notifyCompletion doesn't exist
    this.notifyCompletion(transformed.length);
    
    return transformed;
  }
}
`;

// Sample 5: React Component (Common React hallucinations)
export const reactHallucination = `
import React, { useState, useEffect } from 'react';

function UserDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // HALLUCINATION: fetchUserData doesn't exist
    fetchUserData()
      .then(data => {
        setUser(data);
        setLoading(false);
      });
  }, []);

  const handleUpdate = async (updates) => {
    // HALLUCINATION: updateUserProfile doesn't exist
    await updateUserProfile(user.id, updates);
    
    // HALLUCINATION: refreshUserData doesn't exist
    await refreshUserData();
  };

  const handleDelete = async () => {
    // HALLUCINATION: confirmDeletion doesn't exist
    if (await confirmDeletion()) {
      // HALLUCINATION: deleteUserAccount doesn't exist
      await deleteUserAccount(user.id);
      
      // HALLUCINATION: redirectToHome doesn't exist
      redirectToHome();
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{user.name}</h1>
      <button onClick={handleUpdate}>Update</button>
      <button onClick={handleDelete}>Delete</button>
    </div>
  );
}
`;

// Sample 6: Python Django View (Python hallucinations)
export const pythonDjangoHallucination = `
from django.http import JsonResponse
from django.views import View

class UserAPIView(View):
    def get(self, request, user_id):
        # HALLUCINATION: validate_user_id doesn't exist
        if not self.validate_user_id(user_id):
            return JsonResponse({'error': 'Invalid user ID'}, status=400)
        
        # HALLUCINATION: get_user_from_cache doesn't exist
        user = self.get_user_from_cache(user_id)
        
        if not user:
            # HALLUCINATION: fetch_user_from_db doesn't exist
            user = self.fetch_user_from_db(user_id)
            
            # HALLUCINATION: cache_user_data doesn't exist
            self.cache_user_data(user)
        
        # HALLUCINATION: serialize_user doesn't exist
        data = self.serialize_user(user)
        
        # HALLUCINATION: log_access doesn't exist
        self.log_access(request.user, user_id)
        
        return JsonResponse(data)
    
    def post(self, request):
        # HALLUCINATION: validate_request_data doesn't exist
        if not self.validate_request_data(request.POST):
            return JsonResponse({'error': 'Invalid data'}, status=400)
        
        # HALLUCINATION: create_user doesn't exist
        user = self.create_user(request.POST)
        
        # HALLUCINATION: send_welcome_email doesn't exist
        self.send_welcome_email(user.email)
        
        return JsonResponse({'id': user.id}, status=201)
`;

// Sample 7: Correct code (no hallucinations) for comparison
export const correctCode = `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }

  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error('Division by zero');
    }
    return a / b;
  }

  calculate(operation: string, a: number, b: number): number {
    switch (operation) {
      case 'add':
        return this.add(a, b);
      case 'subtract':
        return this.subtract(a, b);
      case 'multiply':
        return this.multiply(a, b);
      case 'divide':
        return this.divide(a, b);
      default:
        throw new Error('Unknown operation');
    }
  }
}
`;

export const allSamples = {
  authServiceHallucination,
  ecommerceHallucination,
  apiClientHallucination,
  dataPipelineHallucination,
  reactHallucination,
  pythonDjangoHallucination,
  correctCode
};
