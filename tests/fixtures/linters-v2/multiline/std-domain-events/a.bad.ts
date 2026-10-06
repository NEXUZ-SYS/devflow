export async function place(orderId: string) {
  await bus.publish({
    type: 'OrderPlaced',
    orderId,
  });
}
