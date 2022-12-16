# =========================================================================
#
# NOTE: We use 4 bytes little endian (x86) by default.
# If you choose a different endian, you may have to modify header length.
#
# =========================================================================

from sys import exc_info
from common import conf
import errno
import socket
import struct
import json
from bson import json_util
from typing import TYPE_CHECKING
import logging

if TYPE_CHECKING:
    from gameEntity import GameEntity
logger = logging.getLogger()


class RpcProxy(object):
    def __init__(self, owner, netstream):
        # type: (GameEntity, NetStream) -> None
        self.owner = owner
        self.netstream = netstream

    def close(self):
        self.owner = None
        self.netstream = None

    def __getitem__(self, name):
        def call(_self, *args, **kwargs):
            # not support key-value pairs
            _self.owner.packet_no += 1
            kwargs["Packet_Number"] = _self.owner.packet_no
            if not kwargs.__contains__("code"):
                kwargs["code"] = 0
            if not kwargs.__contains__("msg"):
                kwargs["msg"] = conf.RET_CODE_MAP[kwargs["code"]]
            info = {
                'method': name,
                'args': args,
                'kwargs': kwargs,
                'code': 0
            }
            # logger.info("_packet_no %d" % _self.owner.packet_no, "info %s" % info)
            _self.netstream and _self.netstream.send(json_util.dumps(info))

        setattr(RpcProxy, name, call)
        return getattr(self, name)

    def parse_rpc(self, data):
        try:
            info = json.loads(data)
            method = info.get('method', None)
        except:
            logger.error("parse json failed, pass" + data)
            return

        if method is None:
            return
        func = getattr(self.owner, "call", None)
        if func:
            if getattr(func, '__exposed__', False):
                func(method, *info['args'], **info['kwargs'])
            else:
                print('invalid rpc call, NOT PERMITTED:', method)
        else:
            print('invalid rpc call, NOT EXIST:', method)


class NetStream(object):
    def __init__(self):
        super(NetStream, self).__init__()

        self.sock = None  # socket object
        self.send_buf = []  # send buffer
        self.recv_buf = []  # recv buffer

        self.state = conf.NET_STATE_STOP
        self.errd = (errno.EINPROGRESS, errno.EALREADY, errno.EWOULDBLOCK)
        self.conn = (errno.EISCONN, 10057, 10053)
        self.errc = 0
        self.hid = 0

        self.waiting = b""
        self.waitingLength = 0

        return

    def status(self):
        return self.state

    # connect the remote server
    def connect(self, address, port):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.setblocking(False)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        self.sock.connect_ex((address, port))
        self.state = conf.NET_STATE_CONNECTING
        self.send_buf = []
        self.recv_buf = []
        self.errc = 0

        return 0

    # close connection
    def close(self):
        self.state = conf.NET_STATE_STOP

        if not self.sock:
            return 0
        try:
            self.sock.close()
        except:
            pass  # should logging here

        self.sock = None

        return 0

    # assign a socket to netstream
    def assign(self, sock):
        self.close()
        self.sock = sock
        self.sock.setblocking(0)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        self.state = conf.NET_STATE_ESTABLISHED
        self.nodelay(1)

        self.send_buf = []
        self.recv_buf = []

        return 0

    # set tcp nodelay flag
    def nodelay(self, nodelay=0):
        if 'TCP_NODELAY' not in socket.__dict__:
            return -1
        if self.state != 2:
            return -2
        self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, nodelay)

        return 0

    # update
    def process(self):
        if self.state == conf.NET_STATE_STOP:
            return 0
        if self.state == conf.NET_STATE_CONNECTING:
            self.__tryConnect()
        if self.state == conf.NET_STATE_ESTABLISHED:
            self.__tryRecv()
        if self.state == conf.NET_STATE_ESTABLISHED:
            self.__trySend()

        return 0

    def __tryConnect(self):
        if self.state == conf.NET_STATE_ESTABLISHED:
            return 1
        if self.state != conf.NET_STATE_CONNECTING:
            return -1
        try:
            self.sock.recv(0)
        except socket.error as error:
            code, _ = error.errno, error.strerror
            if code in self.conn:
                return 0
            if code in self.errd:
                self.state = conf.NET_STATE_ESTABLISHED
                self.recv_buf = []
                logger.info("success connect to gate server")
                return 1

            self.close()
            return -1

        self.state = conf.NET_STATE_ESTABLISHED
        logger.info("success connect to gate server")
        return 1

    # append data into send_buf with a size header
    def send(self, data):
        self.__sendRaw(data)

        return 0

    # append data to send_buf then try to send it out (__try_send)
    def __sendRaw(self, data):
        self.send_buf.append(data)
        self.process()

        return 0

    # send data from send_buf until block (reached system buffer limit)
    def __trySend(self):
        wsize = 0
        if len(self.send_buf) == 0:
            return 0
        send_data: str = self.send_buf.pop(0)
        str_byte = str.encode(send_data, encoding='utf-8')
        str_byte = NetStream.__EncryptXOR(str_byte)
        length = len(str_byte) + 4
        str_byte = length.to_bytes(
            4, byteorder='little', signed=False) + str_byte
        try:
            # print "self.send_buf",self.send_buf
            wsize = self.sock.send(str_byte)

        except socket.error as error:
            code, _ = error.errno, error.strerror
            if code not in self.errd:
                self.errc = code
                self.close()

                return -1
        return wsize

    # recv an entire message from recv_buf
    def recv(self):
        if len(self.recv_buf) == 0:
            return b''

        return self.recv_buf.pop(0)

    # try to receive all the data into recv_buf
    def __tryRecv(self):
        rdata = b''
        cnt = 0
        while 1:
            text = b''
            try:
                text = self.sock.recv(10240)
                if not text:
                    self.errc = 10000
                    self.close()

                    return -1

            except socket.error as error:
                code, _ = error.errno, error.strerror
                if code not in self.errd:
                    self.errc = code
                    self.close()
                    return -1
            if text == b'':
                break

            rdata = rdata + text
            try:
                self.__parse_raw(rdata)
                cnt += 1
                if cnt > 10:
                    break
                # self.recv_buf.append(rdata.decode('utf-8'))
            except:
                logger.error("parse data failed: ", exc_info=True)
                logger.error(rdata)
        return len(rdata)

    def __parse_raw(self, data: bytes):
        # 如果上个包没接收全的
        if len(self.waiting) > 0:
            t = data[:self.waitingLength]
            self.waiting += t
            data = data[self.waitingLength:]
            self.waitingLength -= len(t)
            # 这个包补齐了
            if self.waitingLength <= 0:
                self.waiting = NetStream.__EncryptXOR(self.waiting)
                logger.debug("data is %s" % self.waiting)
                self.recv_buf.append(self.waiting.decode())
                self.waiting = b""

        while data:
            length = int.from_bytes(data[:4], "little")
            data = data[4:]
            if length > len(data):
                # 数据包截断了
                self.waiting += data
                # 还剩 length - len(data)的数据没收到
                self.waitingLength = length - len(data)
                break
            packet = data[:length]
            data = data[length:]
            packet = NetStream.__EncryptXOR(packet)
            logger.debug("data is %s" % packet)
            self.recv_buf.append(packet.decode())

    secretKey = str.encode("billiards")

    @staticmethod
    def __EncryptXOR(data: bytes) -> bytes:
        outs = []
        for i in range(len(data)):
            outs.append(data[i] ^ NetStream.secretKey[i %
                        len(NetStream.secretKey)])
        return bytes(outs)
