import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  const event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);

  switch (event.type) {
    case 'checkout.session.completed':
      break;
    case 'invoice.payment_failed':
      break;
  }
  return new Response(JSON.stringify({ received: true }));
}
