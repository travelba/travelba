import Capacitor

class PortalViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PortalPlugin())
    }
}
