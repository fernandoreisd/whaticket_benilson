const axios = require('axios');
const path = require('path');
import fs from "fs";
import { Request, Response } from "express";
import * as Yup from "yup";
import AppError from "../errors/AppError";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import Message from "../models/Message";
import Whatsapp from "../models/Whatsapp";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import CheckIsValidContact from "../services/WbotServices/CheckIsValidContact";
import CheckContactNumber from "../services/WbotServices/CheckNumber";
import GetProfilePicUrl from "../services/WbotServices/GetProfilePicUrl";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import SendWhatsAppLink from "../services/WbotServices/SendWhatsAppLink";


type WhatsappData = {
  whatsappId: number;
  agendamentoId: number;
}

type DataType ={
  linkUrl: string
}

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
};

interface ContactData {
  number: string;
}

/*const downloadFile = async (fileUrl: string) => {
  const fileName = path.basename(fileUrl);
  const downloadFolder = 'public'
  const localFilePath = path.resolve(__dirname, '../../',downloadFolder, fileName);

  try {
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream',
    });
    
    const w = response.data.pipe(fs.createWriteStream(localFilePath));
    w.on('finish', async() => {
      console.log('Successfully downloaded file!');
      await SendWhatsAppLink({ body, path, filename, ticket: contactAndTicket });

    });

    return {path: localFilePath, filename: fileName}

  } catch (err) { 
    throw new Error(err);
  }
}; */

const createContact = async (newContact: string, whatsappId: number | undefined ) => {
  await CheckIsValidContact(newContact);

  const validNumber: any = await CheckContactNumber(newContact);

  const profilePicUrl = await GetProfilePicUrl(validNumber);
  const number = validNumber;

  const contactData = {
    name: `${number}`,
    number,
    profilePicUrl,
    isGroup: false
  };

  const contact = await CreateOrUpdateContactService(contactData);

  let whatsapp: Whatsapp | null;

  if (whatsappId === undefined) {
    whatsapp = await GetDefaultWhatsApp();
  } else {
    whatsapp = await Whatsapp.findByPk(whatsappId);

    if (whatsapp === null) {
      throw new AppError(`whatsapp #${whatsappId} not found`);
    }
  }

  //const defaultWhatsapp = await GetDefaultWhatsApp();

  const createTicket = await FindOrCreateTicketService(
    contact,
    //defaultWhatsapp.id,
    whatsapp.id,
    1
  );

  const ticket = await ShowTicketService(createTicket.id);

  SetTicketMessagesAsRead(ticket);

  return ticket;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const newContact: ContactData = req.body;
  const { whatsappId, agendamentoId }: WhatsappData = req.body;
  const { body, quotedMsg }: MessageData = req.body;
  const { linkUrl }: DataType = req.body;
  const medias = req.files as Express.Multer.File[];

  newContact.number = newContact.number.replace("-", "").replace(" ", "");

  const schema = Yup.object().shape({
    number: Yup.string()
      .required()
      .matches(/^\d+$/, "Invalid number format. Only numbers is allowed.")
  });

  try {
    await schema.validate(newContact);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const contactAndTicket = await createContact(newContact.number, whatsappId );

  const downloadFile = async (fileUrl: string) => {
    const fileName = path.basename(fileUrl);
    const downloadFolder = 'public'
    const localFilePath = path.resolve(__dirname, '../../',downloadFolder, fileName);
  
    try {
      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'stream',
      });
      
      const w = response.data.pipe(fs.createWriteStream(localFilePath));
      w.on('finish', async() => {
        console.log('Successfully downloaded file!');

        let path = localFilePath
        let filename = fileName
        await SendWhatsAppLink({ body, path, filename, ticket: contactAndTicket });
  
      });
  
    } catch (err) { 
      throw new Error(err);
    }
  }; 

  if(linkUrl){
    await downloadFile(linkUrl)   

  }else if(medias) {
    await Promise.all(
      medias.map(async (media: Express.Multer.File) => {
        await SendWhatsAppMedia({ body, media, ticket: contactAndTicket });
      })
    );
  } else {
    await SendWhatsAppMessage({ body, ticket: contactAndTicket, quotedMsg });
  }


  setTimeout(async () => {   

        console.log(agendamentoId)

        if(agendamentoId !== null){
          await UpdateTicketService( {ticketId: contactAndTicket.id, ticketData: { userId: 4, status: "open", agendamentoId:  agendamentoId}});
        }else{
          await UpdateTicketService( {ticketId: contactAndTicket.id, ticketData: { status: "close"}});
        }
    }, 1000);
    return res.send({ response: "SUCCESS" });
  };