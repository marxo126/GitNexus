import SwiftUI

struct ContentView: View {
    @State private var showSettings = false
    @State private var showCamera = false

    var body: some View {
        NavigationStack {
            List {
                NavigationLink(destination: ProductDetailView(product: Product())) {
                    Text("Product")
                }
                NavigationLink(destination: ProfileView()) {
                    Text("Profile")
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraView()
            }
            .navigationDestination(for: Product.self) { product in
                ProductDetailView(product: product)
            }
        }
    }
}
