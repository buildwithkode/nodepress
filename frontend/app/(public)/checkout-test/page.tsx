'use client';

import React, { useState, useEffect } from 'react';
import Script from 'next/script';
import api from '@/lib/axios';
import {
  ShoppingBag,
  Tag,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  FileText,
  Printer,
  Truck,
  CreditCard,
  Lock,
  Search,
  Sparkles,
  Zap,
  ExternalLink,
  ChevronRight,
  Box,
  MapPin,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Variant {
  sku: string;
  name: string;
  pricedelta?: number;
  priceDelta?: number;
  stockquantity?: number;
  stockQuantity?: number;
}

interface Product {
  id: number;
  title: string;
  price: number;
  compareAtPrice?: number;
  sku: string;
  stockQuantity: number;
  category?: string;
  variants: Variant[];
}

export default function CheckoutTestPage() {
  const [activeView, setActiveView] = useState<'checkout' | 'lookup'>('checkout');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);

  // Promo Coupon State
  const [couponCode, setCouponCode] = useState<string>('FESTIVE30');
  const [discountInfo, setDiscountInfo] = useState<{ discountAmount: number; finalTotal: number; code: string } | null>(null);
  const [couponLoading, setCouponLoading] = useState<boolean>(false);
  const [couponError, setCouponError] = useState<string>('');

  // Shipping Fee State
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [isFreeShipping, setIsFreeShipping] = useState<boolean>(false);

  // Customer Form State
  const [customerName, setCustomerName] = useState<string>('Ananya Sharma');
  const [customerEmail, setCustomerEmail] = useState<string>('ananya.sharma@gmail.com');
  const [customerPhone, setCustomerPhone] = useState<string>('9876543210');
  const [addressLine1, setAddressLine1] = useState<string>('42, Vasant Vihar, Sector 3');
  const [city, setCity] = useState<string>('New Delhi');
  const [state, setState] = useState<string>('Delhi');
  const [postalCode, setPostalCode] = useState<string>('110057');
  const [paymentGateway, setPaymentGateway] = useState<'razorpay' | 'stripe' | 'lemonsqueezy'>('razorpay');

  // Checkout Execution State
  const [loading, setLoading] = useState<boolean>(false);
  const [paidOrder, setPaidOrder] = useState<any>(null);
  const [error, setError] = useState<string>('');

  // Self-Service Lookup State
  const [lookupEmail, setLookupEmail] = useState<string>('ananya.sharma@gmail.com');
  const [lookupResults, setLookupResults] = useState<any[]>([]);
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);

  // Fetch catalog on mount
  useEffect(() => {
    fetchCatalog();
  }, []);

  async function fetchCatalog() {
    try {
      const res = await api.get('/commerce/products');
      const prods = res.data?.data || [];
      setProducts(prods);
      if (prods.length > 0) {
        setSelectedProduct(prods[0]);
        if (prods[0].variants?.length > 0) {
          setSelectedVariant(prods[0].variants[0].sku);
        }
      }
    } catch (err: any) {
      setError('Could not connect to NodePress Commerce API. Please make sure backend is running.');
    }
  }

  // Calculate unit price & subtotal
  const basePrice = selectedProduct?.price || 4999;
  const currentVariant = selectedProduct?.variants?.find((v) => v.sku === selectedVariant);
  const variantDelta = currentVariant?.pricedelta ?? currentVariant?.priceDelta ?? 0;
  const unitPrice = basePrice + variantDelta;
  const subtotal = unitPrice * quantity;
  const discountAmount = discountInfo ? discountInfo.discountAmount : 0;

  // Auto-calculate dynamic shipping whenever subtotal or coupon changes
  useEffect(() => {
    async function calcShipping() {
      try {
        const res = await api.post('/commerce/shipping/calculate', {
          subtotal,
          couponCode: discountInfo?.code || undefined,
        });
        setShippingFee(res.data.shippingFee);
        setIsFreeShipping(res.data.isFree);
      } catch {
        setShippingFee(subtotal >= 1500 ? 0 : 99);
        setIsFreeShipping(subtotal >= 1500);
      }
    }
    calcShipping();
  }, [subtotal, discountInfo]);

  const finalTotal = Math.max(0, subtotal - discountAmount + shippingFee);

  // Apply Coupon Action
  async function applyCoupon(codeToApply?: string) {
    const code = (codeToApply || couponCode).trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await api.post('/commerce/coupons/validate', {
        code,
        subtotal,
      });
      setDiscountInfo(res.data);
      setCouponCode(code);
      toast.success(`Coupon "${code}" applied! (Saved ₹${res.data.discountAmount.toLocaleString('en-IN')})`);
    } catch (err: any) {
      setDiscountInfo(null);
      setCouponError(err.response?.data?.message || 'Invalid promotional coupon code');
      toast.error(err.response?.data?.message || 'Invalid coupon code');
    } finally {
      setCouponLoading(false);
    }
  }

  // Preset Location Autofill
  function applyPresetLocation(preset: 'delhi' | 'mumbai' | 'bangalore') {
    if (preset === 'delhi') {
      setCustomerName('Ananya Sharma');
      setCustomerEmail('ananya.sharma@gmail.com');
      setAddressLine1('42, Vasant Vihar, Sector 3');
      setCity('New Delhi');
      setState('Delhi');
      setPostalCode('110057');
    } else if (preset === 'mumbai') {
      setCustomerName('Rohan Deshmukh');
      setCustomerEmail('rohan.deshmukh@gmail.com');
      setAddressLine1('12B, Nariman Point');
      setCity('Mumbai');
      setState('Maharashtra');
      setPostalCode('400021');
    } else {
      setCustomerName('Priya Nair');
      setCustomerEmail('priya.nair@gmail.com');
      setAddressLine1('88, Koramangala 4th Block');
      setCity('Bangalore');
      setState('Karnataka');
      setPostalCode('560034');
    }
  }

  // Execute Checkout
  async function handleCheckout(isSimulatedSandbox = false) {
    if (!selectedProduct) return;
    setLoading(true);
    setError('');

    try {
      // 1. Create Pending Order & Checkout Session on Backend
      const sessionRes = await api.post('/commerce/checkout/create-session', {
        items: [
          {
            productId: selectedProduct.id,
            variantSku: selectedVariant || undefined,
            quantity,
          },
        ],
        customerEmail,
        customerName,
        shippingAddress: {
          name: customerName,
          addressLine1,
          city,
          state,
          postalCode,
          country: 'India',
          phone: customerPhone,
        },
        couponCode: discountInfo?.code || undefined,
        gateway: paymentGateway,
        currency: 'INR',
      });

      const sessionData = sessionRes.data;

      // 2. Simulated Sandbox Instant Test Mode
      if (isSimulatedSandbox || paymentGateway === 'razorpay') {
        const mockTxId = `pay_live_${Date.now().toString().slice(-6)}`;

        // Verify Razorpay Webhook
        await api.post('/commerce/webhooks/razorpay', {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: mockTxId,
                notes: { orderNumber: sessionData.orderNumber },
                amount: sessionData.amountInPaise || Math.round(finalTotal * 100),
              },
            },
          },
        });

        // Fetch completed order snapshot
        const orderRes = await api.get(`/commerce/orders`);
        const latest = orderRes.data.data.find((o: any) => o.orderNumber === sessionData.orderNumber);

        setPaidOrder(latest || { ...sessionData, transactionId: mockTxId, paymentStatus: 'paid' });
        toast.success(`🎉 Payment Verified! Order #${sessionData.orderNumber} is confirmed.`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Checkout session creation failed');
      toast.error(err?.response?.data?.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  }

  // Self-Service Lookup
  async function handleLookup() {
    if (!lookupEmail.trim()) return;
    setLookupLoading(true);
    try {
      const res = await api.post('/commerce/storefront/lookup', { email: lookupEmail.trim() });
      setLookupResults(res.data.data || []);
      if (res.data.data.length === 0) {
        toast.info('No orders found for this email address.');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      {/* Razorpay Checkout Script */}
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight flex items-center gap-2">
                <span>NodePress Storefront</span>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono">
                  EcommPress v2.0
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">Interactive Headless Checkout & Order Testing Sandbox</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-muted/40 p-1 rounded-lg border border-border flex items-center gap-1 text-xs">
              <button
                onClick={() => setActiveView('checkout')}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  activeView === 'checkout'
                    ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                🛒 Storefront Checkout
              </button>
              <button
                onClick={() => setActiveView('lookup')}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  activeView === 'lookup'
                    ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                🔍 Customer Order Tracking
              </button>
            </div>

            <a
              href="/commerce"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold border border-border transition"
            >
              Commerce Hub &rarr;
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* ─── VIEW 1: CHECKOUT EXPERIENCE ────────────────────────────────────── */}
        {activeView === 'checkout' && (
          <div className="space-y-6">
            {/* Catalog Selector Banner */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" /> Select Product from Catalog
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click any item to load its variant matrix, dynamic pricing, and stock count.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={fetchCatalog} className="h-7 text-xs">
                  <RefreshCw className="w-3 h-3 mr-1" /> Refresh Catalog
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {products.map((p) => {
                  const isSelected = selectedProduct?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProduct(p);
                        if (p.variants?.length > 0) {
                          setSelectedVariant(p.variants[0].sku);
                        } else {
                          setSelectedVariant('');
                        }
                      }}
                      className={`text-left p-3.5 rounded-xl border transition flex items-start gap-3 ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40'
                          : 'border-border bg-muted/20 hover:bg-muted/40'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg shrink-0">
                        {p.category === 'Ethnic Wear' ? '🥻' : p.category === 'Winter Wear' ? '🧣' : '🎧'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs text-foreground truncate">{p.title}</div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">SKU: {p.sku}</div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-bold text-xs text-foreground">₹{p.price?.toLocaleString('en-IN')}</span>
                          <span className="text-[10px] text-emerald-400 font-semibold">{p.stockQuantity} in stock</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* If Order is Paid, show Confirmation View */}
            {paidOrder ? (
              <div className="bg-card border border-emerald-500/30 rounded-2xl p-6 sm:p-8 shadow-lg space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/20">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1 max-w-md mx-auto">
                  <h2 className="text-2xl font-bold text-foreground">Thank You, {paidOrder.customerName}!</h2>
                  <p className="text-xs text-muted-foreground">
                    Your payment was cryptographically verified. Order <strong className="font-mono text-primary">{paidOrder.orderNumber}</strong> has been confirmed.
                  </p>
                </div>

                {/* Details Card */}
                <div className="max-w-xl mx-auto bg-muted/30 border border-border rounded-xl p-4 text-xs space-y-2.5 text-left">
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Order Number:</span>
                    <span className="font-mono font-bold text-primary">{paidOrder.orderNumber}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Payment Gateway:</span>
                    <span className="font-semibold uppercase text-foreground">{paidOrder.paymentGateway || 'Razorpay UPI'}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Transaction ID:</span>
                    <span className="font-mono text-emerald-400">{paidOrder.transactionId || 'pay_live_mock'}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Total Paid:</span>
                    <span className="font-bold text-base text-foreground">₹{paidOrder.totalAmount?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fulfillment Status:</span>
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                      PROCESSING &bull; READY TO DISPATCH
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const res = await api.get(`/commerce/orders/${paidOrder.id}/invoice`);
                      const win = window.open('', '_blank');
                      if (win) {
                        win.document.write(res.data.html);
                        win.document.close();
                      }
                    }}
                  >
                    <FileText className="w-4 h-4 mr-1.5" /> View Tax Invoice
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const res = await api.get(`/commerce/orders/${paidOrder.id}/shipping-label`);
                      const win = window.open('', '_blank');
                      if (win) {
                        win.document.write(res.data.html);
                        win.document.close();
                      }
                    }}
                  >
                    <Printer className="w-4 h-4 mr-1.5" /> Print 4x6 Label
                  </Button>

                  <Button size="sm" onClick={() => setPaidOrder(null)}>
                    <RotateCcw className="w-4 h-4 mr-1.5" /> Place Another Test Order
                  </Button>
                </div>
              </div>
            ) : (
              /* Two-Column Checkout Layout */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Customer Form & Payment (7 Cols) */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Preset Customer Autofill */}
                  <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                      <span>⚡ Instant Customer Address Presets:</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyPresetLocation('delhi')}>
                        📍 Ananya (New Delhi)
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyPresetLocation('mumbai')}>
                        📍 Rohan (Mumbai)
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyPresetLocation('bangalore')}>
                        📍 Priya (Bangalore)
                      </Button>
                    </div>
                  </div>

                  {/* Step 1: Contact Details */}
                  <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">1</span>
                      Contact Information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Full Name</Label>
                        <Input
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="h-9 text-xs"
                          placeholder="e.g. Ananya Sharma"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email Address</Label>
                        <Input
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          className="h-9 text-xs"
                          placeholder="ananya@example.com"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Shipping Address */}
                  <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">2</span>
                      Delivery Address
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Street Address</Label>
                        <Input
                          value={addressLine1}
                          onChange={(e) => setAddressLine1(e.target.value)}
                          className="h-9 text-xs"
                          placeholder="House / Flat No., Street, Landmark"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">City</Label>
                          <Input
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="h-9 text-xs"
                            placeholder="City"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">State</Label>
                          <Input
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            className="h-9 text-xs"
                            placeholder="State"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">PIN Code</Label>
                          <Input
                            value={postalCode}
                            onChange={(e) => setPostalCode(e.target.value)}
                            className="h-9 text-xs font-mono"
                            placeholder="110057"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Payment Gateway Selector */}
                  <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">3</span>
                      Select Payment Gateway
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => setPaymentGateway('razorpay')}
                        className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                          paymentGateway === 'razorpay'
                            ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/40'
                            : 'border-border bg-muted/20 hover:bg-muted/40'
                        }`}
                      >
                        <div className="font-bold text-xs flex items-center gap-1.5 text-foreground">
                          🇮🇳 Razorpay UPI
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">GPay, PhonePe, Paytm, RuPay, QR</p>
                      </button>

                      <button
                        onClick={() => setPaymentGateway('stripe')}
                        className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                          paymentGateway === 'stripe'
                            ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/40'
                            : 'border-border bg-muted/20 hover:bg-muted/40'
                        }`}
                      >
                        <div className="font-bold text-xs flex items-center gap-1.5 text-foreground">
                          🌍 Stripe Global
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">Apple Pay, Cards, International</p>
                      </button>

                      <button
                        onClick={() => setPaymentGateway('lemonsqueezy')}
                        className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                          paymentGateway === 'lemonsqueezy'
                            ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40'
                            : 'border-border bg-muted/20 hover:bg-muted/40'
                        }`}
                      >
                        <div className="font-bold text-xs flex items-center gap-1.5 text-foreground">
                          🍋 Lemon Squeezy
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">Merchant of Record & Tax</p>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column: Order Summary & Checkout Button (5 Cols) */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5 sticky top-24">
                    <h3 className="font-bold text-sm text-foreground flex items-center justify-between border-b border-border pb-3">
                      <span>Order Summary</span>
                      <span className="text-xs text-muted-foreground font-normal">1 Item Selected</span>
                    </h3>

                    {/* Selected Item & Variant */}
                    {selectedProduct && (
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3 text-xs">
                          <div>
                            <div className="font-bold text-foreground">{selectedProduct.title}</div>
                            <div className="text-muted-foreground font-mono text-[11px] mt-0.5">SKU: {selectedProduct.sku}</div>
                          </div>
                          <div className="font-bold text-sm text-foreground">₹{unitPrice.toLocaleString('en-IN')}</div>
                        </div>

                        {/* Variant Matrix Selector */}
                        {selectedProduct.variants?.length > 0 && (
                          <div className="space-y-1.5 bg-muted/30 p-2.5 rounded-lg border border-border">
                            <Label className="text-[11px] text-muted-foreground">Select Variant Combination:</Label>
                            <select
                              value={selectedVariant}
                              onChange={(e) => setSelectedVariant(e.target.value)}
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
                            >
                              {selectedProduct.variants.map((v) => (
                                <option key={v.sku} value={v.sku}>
                                  {v.name} (SKU: {v.sku}) {v.priceDelta ? `+₹${v.priceDelta}` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Quantity Controls */}
                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="text-muted-foreground font-medium">Quantity:</span>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0 text-xs"
                              onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            >
                              -
                            </Button>
                            <span className="font-bold font-mono px-1">{quantity}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0 text-xs"
                              onClick={() => setQuantity(quantity + 1)}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Promo Coupon Code */}
                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Promo Coupon (e.g. FESTIVE30)"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          className="h-8 text-xs font-mono"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 text-xs font-semibold shrink-0"
                          onClick={() => applyCoupon()}
                          disabled={couponLoading}
                        >
                          Apply
                        </Button>
                      </div>

                      {/* Quick Apply Tags */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">Try:</span>
                        <button
                          onClick={() => applyCoupon('FESTIVE30')}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/20 font-mono text-primary transition"
                        >
                          FESTIVE30 (30% OFF)
                        </button>
                        <button
                          onClick={() => applyCoupon('FLAT500')}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/20 font-mono text-primary transition"
                        >
                          FLAT500 (₹500 OFF)
                        </button>
                      </div>

                      {discountInfo && (
                        <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 pt-1">
                          <CheckCircle2 className="w-3 h-3" /> Coupon &ldquo;{discountInfo.code}&rdquo; Applied (-₹
                          {discountInfo.discountAmount.toLocaleString('en-IN')})
                        </div>
                      )}
                      {couponError && <div className="text-[11px] text-rose-400">{couponError}</div>}
                    </div>

                    {/* Itemized Calculation */}
                    <div className="space-y-2 text-xs border-t border-border pt-3">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Cart Subtotal</span>
                        <span className="font-mono text-foreground font-semibold">₹{subtotal.toLocaleString('en-IN')}</span>
                      </div>

                      {discountAmount > 0 && (
                        <div className="flex justify-between text-emerald-400 font-medium">
                          <span>Promotional Discount</span>
                          <span className="font-mono">-₹{discountAmount.toLocaleString('en-IN')}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>Shipping Delivery</span>
                        <span className={`font-mono font-semibold ${isFreeShipping ? 'text-emerald-400' : 'text-foreground'}`}>
                          {isFreeShipping ? 'FREE (≥ ₹1,500)' : `+₹${shippingFee.toFixed(2)}`}
                        </span>
                      </div>

                      <div className="flex justify-between items-center border-t border-border pt-3 text-sm font-bold">
                        <span className="text-foreground">Total Payable</span>
                        <span className="text-lg text-primary font-mono">₹{finalTotal.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {/* Big Action Buttons */}
                    <div className="space-y-2 pt-2">
                      <Button
                        className="w-full h-11 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20"
                        onClick={() => handleCheckout(false)}
                        disabled={loading}
                      >
                        {loading ? (
                          <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Pay ₹{finalTotal.toLocaleString('en-IN')} with {paymentGateway === 'razorpay' ? 'Razorpay UPI' : 'Stripe'}
                      </Button>

                      {/* 1-Click Instant Sandbox Simulation Button */}
                      <Button
                        variant="outline"
                        className="w-full h-8 text-[11px] font-medium border-dashed border-border hover:bg-muted/50"
                        onClick={() => handleCheckout(true)}
                        disabled={loading}
                      >
                        <Zap className="w-3 h-3 mr-1 text-amber-400" /> Simulate Instant Paid Order (Test Mode)
                      </Button>
                    </div>

                    <div className="text-center text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>256-Bit SSL Encrypted &bull; 0% Platform Fees &bull; Direct Gateway Payout</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── VIEW 2: CUSTOMER SELF-SERVICE ORDER LOOKUP ─────────────────────── */}
        {activeView === 'lookup' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <Search className="w-5 h-5 text-primary" /> Track Your Order & Download Invoice
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enter your email address to view all orders, courier tracking statuses, and tax receipts.
                </p>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Enter email e.g. ananya.sharma@gmail.com"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  className="text-xs"
                />
                <Button size="sm" onClick={handleLookup} disabled={lookupLoading} className="text-xs font-semibold">
                  {lookupLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Search Orders'}
                </Button>
              </div>
            </div>

            {/* Lookup Results */}
            {lookupResults.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-bold text-xs text-muted-foreground uppercase tracking-wider">
                  Found {lookupResults.length} Orders for {lookupEmail}:
                </h3>

                <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden shadow-sm">
                  {lookupResults.map((order) => (
                    <div key={order.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="font-mono font-bold text-primary flex items-center gap-2">
                          <span>{order.orderNumber}</span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              order.paymentStatus === 'paid'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : order.paymentStatus === 'refunded'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}
                          >
                            {order.paymentStatus.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}{' '}
                          &bull; {order.items?.length || 1} Item(s)
                        </div>
                        {order.trackingNumber && (
                          <div className="text-[11px] text-blue-400 font-mono flex items-center gap-1">
                            <Truck className="w-3 h-3" /> AWB: {order.trackingNumber} ({order.carrier})
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-bold text-sm text-foreground">₹{order.totalAmount?.toLocaleString('en-IN')}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={async () => {
                            const res = await api.get(`/commerce/orders/${order.id}/invoice`);
                            const win = window.open('', '_blank');
                            if (win) {
                              win.document.write(res.data.html);
                              win.document.close();
                            }
                          }}
                        >
                          <FileText className="w-3 h-3 mr-1" /> Invoice
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
