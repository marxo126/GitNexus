const channel = supabase.channel('order-updates').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
  console.log(payload);
});
